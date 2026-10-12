package handler

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/model"
)

// DriverHandler handles driver-related REST endpoints.
type DriverHandler struct {
	db *sql.DB
}

// NewDriverHandler creates a new DriverHandler.
func NewDriverHandler(db *sql.DB) *DriverHandler {
	return &DriverHandler{db: db}
}

// ListDrivers returns all drivers with their availability status.
// GET /drivers
func (h *DriverHandler) ListDrivers(c *gin.Context) {
	l := logger.WithContext(c.Request.Context())

	rows, err := h.db.QueryContext(c.Request.Context(),
		`SELECT id, name, phone, available FROM drivers ORDER BY id`)
	if err != nil {
		l.Error().Err(err).Msg("Failed to query drivers")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	defer rows.Close()

	drivers := make([]model.Driver, 0)
	for rows.Next() {
		var d model.Driver
		if err := rows.Scan(&d.ID, &d.Name, &d.Phone, &d.Available); err != nil {
			l.Error().Err(err).Msg("Failed to scan driver row")
			continue
		}
		drivers = append(drivers, d)
	}

	if err := rows.Err(); err != nil {
		l.Error().Err(err).Msg("Error iterating driver rows")
	}

	c.JSON(http.StatusOK, drivers)
}
