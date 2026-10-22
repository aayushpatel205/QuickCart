package middleware

import (
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/quickcart/delivery-service/internal/logger"
	"github.com/quickcart/delivery-service/internal/metrics"
)

// RequestLogging logs every HTTP request with method, path, status, and duration.
// It also records Prometheus HTTP metrics.
func RequestLogging() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		duration := time.Since(start)
		status := c.Writer.Status()
		path := c.FullPath() // Use route pattern, not actual path (avoids high cardinality)
		if path == "" {
			path = c.Request.URL.Path
		}

		// Record Prometheus metrics
		metrics.HTTPRequestsTotal.WithLabelValues(
			c.Request.Method, path, fmt.Sprintf("%d", status),
		).Inc()
		metrics.HTTPRequestDuration.WithLabelValues(
			c.Request.Method, path,
		).Observe(duration.Seconds())

		// Structured log
		l := logger.WithContext(c.Request.Context())
		l.Info().
			Str("method", c.Request.Method).
			Str("path", c.Request.URL.Path).
			Int("status", status).
			Dur("duration", duration).
			Msg("HTTP request completed")
	}
}
