package kafka

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"

	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/metrics"
	"github.com/quickcart/delivery-service/internal/model"
	"github.com/quickcart/delivery-service/internal/rabbitmq"
)

// Consumer listens on order.confirmed and assigns drivers to deliveries.
type Consumer struct {
	reader    *kafkago.Reader
	writer    *kafkago.Writer
	db        *sql.DB
	publisher *rabbitmq.Publisher
}

// NewConsumer creates a Kafka reader (order.confirmed) and writer (delivery.assigned).
func NewConsumer(brokers string, db *sql.DB, publisher *rabbitmq.Publisher) *Consumer {
	brokerList := strings.Split(brokers, ",")

	reader := kafkago.NewReader(kafkago.ReaderConfig{
		Brokers:     brokerList,
		Topic:       "order.confirmed",
		GroupID:     "delivery-service",
		MinBytes:    1,
		MaxBytes:    10e6,
		StartOffset: kafkago.LastOffset,
	})

	writer := &kafkago.Writer{
		Addr:     kafkago.TCP(brokerList...),
		Topic:    "delivery.assigned",
		Balancer: &kafkago.LeastBytes{},
	}

	return &Consumer{
		reader:    reader,
		writer:    writer,
		db:        db,
		publisher: publisher,
	}
}

// Start begins the consumer loop. Blocks until ctx is cancelled.
func (c *Consumer) Start(ctx context.Context) {
	logger.Log.Info().Msg("Kafka consumer started — listening on order.confirmed")

	for {
		select {
		case <-ctx.Done():
			logger.Log.Info().Msg("Kafka consumer shutting down")
			return
		default:
		}

		msg, err := c.reader.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return // context cancelled, clean shutdown
			}
			logger.Log.Error().Err(err).Msg("Failed to fetch Kafka message")
			continue
		}

		metrics.KafkaMessagesConsumed.Inc()
		c.processMessage(ctx, msg)
	}
}

// processMessage parses the event, checks idempotency, and assigns a driver.
func (c *Consumer) processMessage(ctx context.Context, msg kafkago.Message) {
	var event model.OrderConfirmedEvent
	if err := json.Unmarshal(msg.Value, &event); err != nil {
		logger.Log.Error().Err(err).Str("raw", string(msg.Value)).Msg("Failed to unmarshal order.confirmed")
		// Commit so we don't retry a permanently bad message
		c.reader.CommitMessages(ctx, msg)
		return
	}

	// Extract correlationId from Kafka headers or generate one
	correlationID := ""
	for _, h := range msg.Headers {
		if strings.EqualFold(h.Key, "X-Correlation-Id") {
			correlationID = string(h.Value)
			break
		}
	}
	if correlationID == "" {
		correlationID = uuid.New().String()
	}

	// Build a unique event ID for idempotency
	eventID := fmt.Sprintf("%s-%s", event.OrderID, event.Timestamp)
	ctx = context.WithValue(ctx, logger.CorrelationIDKey, correlationID)
	ctx = context.WithValue(ctx, logger.OrderIDKey, event.OrderID)
	l := logger.WithContext(ctx)

	// Idempotency check
	var exists bool
	if err := c.db.QueryRowContext(ctx,
		"SELECT EXISTS(SELECT 1 FROM processed_events WHERE event_id = $1)", eventID,
	).Scan(&exists); err != nil {
		l.Error().Err(err).Msg("Failed to check processed_events")
		return
	}
	if exists {
		l.Info().Msg("Duplicate event detected, skipping")
		c.reader.CommitMessages(ctx, msg)
		return
	}

	// Retry loop with exponential backoff for driver assignment
	const maxRetries = 5
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			backoff := time.Duration(attempt*attempt) * time.Second
			l.Warn().Int("attempt", attempt+1).Dur("backoff", backoff).Msg("Retrying driver assignment")
			select {
			case <-time.After(backoff):
			case <-ctx.Done():
				return
			}
		}

		assigned, err := c.assignDriver(ctx, event, eventID)
		if err != nil {
			l.Error().Err(err).Int("attempt", attempt+1).Msg("Driver assignment failed")
			continue
		}
		if assigned {
			c.reader.CommitMessages(ctx, msg)
			return
		}
		l.Warn().Msg("No available drivers")
	}

	l.Error().Msg("Failed to assign driver after maximum retries")
	c.reader.CommitMessages(ctx, msg)
}

// assignDriver runs the full assignment in a single PostgreSQL transaction:
//  1. SELECT ... FOR UPDATE SKIP LOCKED to grab an available driver
//  2. INSERT the delivery row
//  3. Mark the driver unavailable
//  4. Record the event as processed
//
// Returns (true, nil) on success, (false, nil) if no drivers available.
func (c *Consumer) assignDriver(ctx context.Context, event model.OrderConfirmedEvent, eventID string) (bool, error) {
	l := logger.WithContext(ctx)

	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Lock one available driver — SKIP LOCKED prevents two concurrent
	// transactions from picking the same driver.
	var driver model.Driver
	err = tx.QueryRowContext(ctx,
		`SELECT id, name, phone
		 FROM drivers
		 WHERE available = true
		 ORDER BY id
		 FOR UPDATE SKIP LOCKED
		 LIMIT 1`,
	).Scan(&driver.ID, &driver.Name, &driver.Phone)

	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("select driver: %w", err)
	}

	// Mark driver unavailable
	if _, err := tx.ExecContext(ctx,
		`UPDATE drivers SET available = false WHERE id = $1`, driver.ID,
	); err != nil {
		return false, fmt.Errorf("update driver: %w", err)
	}

	// Insert delivery record
	now := time.Now()
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO deliveries (order_id, driver_id, status, address, assigned_at, updated_at)
		 VALUES ($1, $2, 'ASSIGNED', $3, $4, $4)`,
		event.OrderID, driver.ID, event.Address, now,
	); err != nil {
		return false, fmt.Errorf("insert delivery: %w", err)
	}

	// Record event for idempotency
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO processed_events (event_id) VALUES ($1)`, eventID,
	); err != nil {
		return false, fmt.Errorf("insert processed_event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return false, fmt.Errorf("commit tx: %w", err)
	}

	metrics.DeliveriesAssigned.Inc()
	l.Info().Int("driverId", driver.ID).Str("driverName", driver.Name).Msg("Driver assigned to delivery")

	// --- Publish downstream events (best-effort, delivery is already saved) ---

	// Kafka: delivery.assigned
	assignedEvent := model.DeliveryAssignedEvent{
		OrderID:    event.OrderID,
		DriverID:   driver.ID,
		DriverName: driver.Name,
		Timestamp:  time.Now().Format(time.RFC3339),
	}
	eventBytes, _ := json.Marshal(assignedEvent)

	var headers []kafkago.Header
	if cid, ok := ctx.Value(logger.CorrelationIDKey).(string); ok && cid != "" {
		headers = append(headers, kafkago.Header{Key: "X-Correlation-Id", Value: []byte(cid)})
	}

	if err := c.writer.WriteMessages(ctx, kafkago.Message{
		Key:     []byte(event.OrderID),
		Value:   eventBytes,
		Headers: headers,
	}); err != nil {
		l.Error().Err(err).Msg("Failed to publish delivery.assigned to Kafka")
	} else {
		l.Info().Msg("Published delivery.assigned to Kafka")
	}

	// RabbitMQ: DRIVER_ASSIGNED notification
	notification := model.NotificationMessage{
		OrderID: event.OrderID,
		UserID:  event.UserID,
		Type:    "DRIVER_ASSIGNED",
		Message: fmt.Sprintf("Driver %s has been assigned to your order", driver.Name),
	}
	if err := c.publisher.Publish(ctx, notification); err != nil {
		l.Error().Err(err).Msg("Failed to publish DRIVER_ASSIGNED notification")
	}

	return true, nil
}

// Close shuts down the Kafka reader and writer.
func (c *Consumer) Close() {
	if c.reader != nil {
		c.reader.Close()
	}
	if c.writer != nil {
		c.writer.Close()
	}
	logger.Log.Info().Msg("Kafka consumer closed")
}
