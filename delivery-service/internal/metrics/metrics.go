package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for the delivery service.
var (
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests processed.",
		},
		[]string{"method", "path", "status"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "Duration of HTTP requests in seconds.",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	KafkaMessagesConsumed = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "kafka_messages_consumed_total",
			Help: "Total Kafka messages consumed from order.confirmed.",
		},
	)

	DeliveriesAssigned = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "deliveries_assigned_total",
			Help: "Total deliveries successfully assigned to drivers.",
		},
	)
)
