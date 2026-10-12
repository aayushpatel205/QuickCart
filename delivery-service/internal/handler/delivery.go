package handler

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/model"
	"github.com/quickcart/delivery-service/internal/rabbitmq"
)

// DeliveryHandler handles delivery-related REST endpoints.
type DeliveryHandler struct {
	db        *sql.DB
	publisher *rabbitmq.Publisher
}

// NewDeliveryHandler creates a new DeliveryHandler.
func NewDeliveryHandler(db *sql.DB, publisher *rabbitmq.Publisher) *DeliveryHandler {
	return &DeliveryHandler{db: db, publisher: publisher}
}

// GetDelivery returns delivery status and driver info for a given order.
// GET /deliveries/:orderId
func (h *DeliveryHandler) GetDelivery(c *gin.Context) {
	orderID := c.Param("orderId")
	ctx := context.WithValue(c.Request.Context(), logger.OrderIDKey, orderID)
	l := logger.WithContext(ctx)

	var d model.Delivery
	err := h.db.QueryRowContext(ctx,
		`SELECT d.id, d.order_id, d.driver_id, dr.name, dr.phone, d.status, d.address, d.assigned_at, d.updated_at
		 FROM deliveries d
		 JOIN drivers dr ON d.driver_id = dr.id
		 WHERE d.order_id = $1`, orderID,
	).Scan(&d.ID, &d.OrderID, &d.DriverID, &d.DriverName, &d.DriverPhone, &d.Status, &d.Address, &d.AssignedAt, &d.UpdatedAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "delivery not found"})
		return
	}
	if err != nil {
		l.Error().Err(err).Msg("Failed to query delivery")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	c.JSON(http.StatusOK, d)
}

// validStatuses are the allowed status transitions for a driver.
var validStatuses = map[string]bool{
	"PICKED_UP":  true,
	"ON_THE_WAY": true,
	"DELIVERED":  true,
}

// UpdateStatus allows a DRIVER to update the delivery status.
// PUT /deliveries/:orderId/status
func (h *DeliveryHandler) UpdateStatus(c *gin.Context) {
	orderID := c.Param("orderId")
	ctx := context.WithValue(c.Request.Context(), logger.OrderIDKey, orderID)
	l := logger.WithContext(ctx)

	// Authorization: only DRIVER role
	role := c.GetHeader("X-User-Role")
	if role != "DRIVER" {
		c.JSON(http.StatusForbidden, gin.H{"error": "only DRIVER role can update delivery status"})
		return
	}

	var req model.UpdateStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status is required"})
		return
	}

	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be PICKED_UP, ON_THE_WAY, or DELIVERED"})
		return
	}

	// Update the delivery status
	now := time.Now()
	var deliveryID string
	err := h.db.QueryRowContext(ctx,
		`UPDATE deliveries SET status = $1, updated_at = $2
		 WHERE order_id = $3 RETURNING id`,
		req.Status, now, orderID,
	).Scan(&deliveryID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "delivery not found"})
		return
	}
	if err != nil {
		l.Error().Err(err).Msg("Failed to update delivery status")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}

	l.Info().Str("status", req.Status).Msg("Delivery status updated")

	// When delivered, release the driver back to the pool
	if req.Status == "DELIVERED" {
		if _, err := h.db.ExecContext(ctx,
			`UPDATE drivers SET available = true
			 WHERE id = (SELECT driver_id FROM deliveries WHERE order_id = $1)`,
			orderID,
		); err != nil {
			l.Error().Err(err).Msg("Failed to release driver")
		}
	}

	// Publish status change notification to RabbitMQ
	userID := c.GetHeader("X-User-Id")
	notification := model.NotificationMessage{
		OrderID: orderID,
		UserID:  userID,
		Type:    "STATUS_" + req.Status,
		Message: "Delivery status updated to " + req.Status,
	}
	if err := h.publisher.Publish(ctx, notification); err != nil {
		l.Error().Err(err).Msg("Failed to publish status notification")
	}

	c.JSON(http.StatusOK, gin.H{"message": "status updated", "status": req.Status})
}
