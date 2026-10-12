package handler

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/quickcart/delivery-service/internal/model"
)

// HealthHandler provides liveness and readiness probes.
type HealthHandler struct {
	db *sql.DB
}

// NewHealthHandler creates a new HealthHandler.
func NewHealthHandler(db *sql.DB) *HealthHandler {
	return &HealthHandler{db: db}
}

// Health checks database connectivity and returns service health status.
// Used by Kubernetes liveness and readiness probes.
func (h *HealthHandler) Health(c *gin.Context) {
	dbStatus := "ok"

	if err := h.db.Ping(); err != nil {
		dbStatus = "error"
		c.JSON(http.StatusServiceUnavailable, model.HealthResponse{
			Status: "DOWN",
			DB:     dbStatus,
		})
		return
	}

	c.JSON(http.StatusOK, model.HealthResponse{
		Status: "UP",
		DB:     dbStatus,
	})
}
