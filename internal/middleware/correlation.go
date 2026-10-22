package middleware

import (
	"context"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/quickcart/delivery-service/internal/logger"
)

// CorrelationID reads X-Correlation-Id from the request header.
// If missing, it generates a new UUID. The value is stored in the
// request context and echoed back in the response header.
func CorrelationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		cid := c.GetHeader("X-Correlation-Id")
		if cid == "" {
			cid = uuid.New().String()
		}

		ctx := context.WithValue(c.Request.Context(), logger.CorrelationIDKey, cid)
		c.Request = c.Request.WithContext(ctx)
		c.Header("X-Correlation-Id", cid)

		c.Next()
	}
}
