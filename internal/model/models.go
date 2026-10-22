package model

import "time"

// Driver represents a delivery driver.
type Driver struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	Phone     string `json:"phone"`
	Available bool   `json:"available"`
}

// Delivery represents a delivery assignment.
type Delivery struct {
	ID          string    `json:"id"`
	OrderID     string    `json:"orderId"`
	DriverID    int       `json:"driverId"`
	DriverName  string    `json:"driverName,omitempty"`
	DriverPhone string    `json:"driverPhone,omitempty"`
	Status      string    `json:"status"`
	Address     string    `json:"address"`
	AssignedAt  time.Time `json:"assignedAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// --- Kafka event types ---

// OrderConfirmedEvent is consumed from the order.confirmed topic.
type OrderConfirmedEvent struct {
	OrderID   string `json:"orderId"`
	UserID    string `json:"userId"`
	Address   string `json:"address"`
	Timestamp string `json:"timestamp"`
}

// DeliveryAssignedEvent is published to the delivery.assigned topic.
type DeliveryAssignedEvent struct {
	OrderID    string `json:"orderId"`
	DriverID   int    `json:"driverId"`
	DriverName string `json:"driverName"`
	Timestamp  string `json:"timestamp"`
}

// --- RabbitMQ notification ---

// NotificationMessage is published to the quickcart.notifications exchange.
type NotificationMessage struct {
	OrderID string `json:"orderId"`
	UserID  string `json:"userId"`
	Type    string `json:"type"`
	Message string `json:"message"`
}

// --- REST request/response ---

// UpdateStatusRequest is the body for PUT /deliveries/:orderId/status.
type UpdateStatusRequest struct {
	Status string `json:"status" binding:"required"`
}

// HealthResponse is returned by GET /health.
type HealthResponse struct {
	Status string `json:"status"`
	DB     string `json:"db"`
}
