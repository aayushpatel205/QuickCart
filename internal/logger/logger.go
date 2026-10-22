package logger

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"
)

// Context keys for structured logging fields.
type ctxKey string

const (
	CorrelationIDKey ctxKey = "correlationId"
	OrderIDKey       ctxKey = "orderId"
)

// Log is the package-level logger instance used throughout the service.
var Log zerolog.Logger

// Init configures the global zerolog logger with structured JSON output.
// If logFilePath is non-empty, logs are written to both stdout and the file
// (used by the Promtail sidecar in Kubernetes).
func Init(serviceName string, logFilePath string) {
	zerolog.TimeFieldFormat = time.RFC3339

	var writer io.Writer = os.Stdout

	if logFilePath != "" {
		if dir := filepath.Dir(logFilePath); dir != "" {
			_ = os.MkdirAll(dir, 0755)
		}
		file, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			// Fall back to stdout only
			Log = zerolog.New(os.Stdout).With().Timestamp().Str("service", serviceName).Logger()
			Log.Warn().Err(err).Msg("Failed to open log file, logging to stdout only")
			return
		}
		writer = io.MultiWriter(os.Stdout, file)
	}

	Log = zerolog.New(writer).
		With().
		Timestamp().
		Str("service", serviceName).
		Logger()
}

// WithContext returns a logger enriched with correlationId and orderId from the context.
func WithContext(ctx context.Context) *zerolog.Logger {
	l := Log.With()

	if cid, ok := ctx.Value(CorrelationIDKey).(string); ok && cid != "" {
		l = l.Str("correlationId", cid)
	}
	if oid, ok := ctx.Value(OrderIDKey).(string); ok && oid != "" {
		l = l.Str("orderId", oid)
	}

	logger := l.Logger()
	return &logger
}
