package rabbitmq

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/sony/gobreaker"

	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/model"
)

// Publisher publishes notification messages to RabbitMQ with a circuit breaker.
type Publisher struct {
	conn     *amqp.Connection
	channel  *amqp.Channel
	cb       *gobreaker.CircuitBreaker
	exchange string
}

// NewPublisher connects to RabbitMQ, declares the exchange, queue, and DLQ.
func NewPublisher(url string) (*Publisher, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open channel: %w", err)
	}

	exchange := "quickcart.notifications"

	// Declare the direct exchange
	if err := ch.ExchangeDeclare(exchange, "direct", true, false, false, false, nil); err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare exchange: %w", err)
	}

	// Declare the dead-letter queue first
	if _, err := ch.QueueDeclare("notification.dlq", true, false, false, false, nil); err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare DLQ: %w", err)
	}

	// Declare main queue with DLQ routing
	if _, err := ch.QueueDeclare("notification.queue", true, false, false, false, amqp.Table{
		"x-dead-letter-exchange":    "",
		"x-dead-letter-routing-key": "notification.dlq",
	}); err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare queue: %w", err)
	}

	// Bind queue to exchange with routing key
	if err := ch.QueueBind("notification.queue", "notification", exchange, false, nil); err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to bind queue: %w", err)
	}

	// Circuit breaker: opens after 5 consecutive failures, half-open after 30s
	cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        "rabbitmq-publisher",
		MaxRequests: 3,
		Interval:    30 * time.Second,
		Timeout:     30 * time.Second,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			return counts.ConsecutiveFailures >= 5
		},
	})

	logger.Log.Info().Msg("Connected to RabbitMQ")
	return &Publisher{conn: conn, channel: ch, cb: cb, exchange: exchange}, nil
}

// Publish sends a notification message through the circuit breaker.
// If the publisher is nil (RabbitMQ unavailable at startup) or the circuit
// breaker is open, the message is logged as a fallback.
func (p *Publisher) Publish(ctx context.Context, msg model.NotificationMessage) error {
	l := logger.WithContext(ctx)

	if p == nil {
		body, _ := json.Marshal(msg)
		l.Warn().
			RawJSON("payload", body).
			Msg("FALLBACK: RabbitMQ not available, notification logged only")
		return nil
	}

	body, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal notification: %w", err)
	}

	_, cbErr := p.cb.Execute(func() (interface{}, error) {
		publishErr := p.channel.PublishWithContext(ctx,
			p.exchange,
			"notification",
			false,
			false,
			amqp.Publishing{
				ContentType:  "application/json",
				DeliveryMode: amqp.Persistent,
				Body:         body,
			},
		)
		return nil, publishErr
	})

	if cbErr != nil {
		l.Error().
			Err(cbErr).
			Str("orderId", msg.OrderID).
			Str("type", msg.Type).
			RawJSON("payload", body).
			Msg("FALLBACK: Failed to publish to RabbitMQ (circuit breaker)")
		return cbErr
	}

	l.Info().
		Str("orderId", msg.OrderID).
		Str("type", msg.Type).
		Msg("Notification published to RabbitMQ")
	return nil
}

// Close shuts down the channel and connection cleanly.
func (p *Publisher) Close() {
	if p == nil {
		return
	}
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
	logger.Log.Info().Msg("RabbitMQ connection closed")
}
