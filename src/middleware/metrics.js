const promClient = require('prom-client');

// Initialize default system metrics (CPU, Memory, Event Loop, GC)
promClient.collectDefaultMetrics({
  prefix: 'quickcart_restaurant_',
  timeout: 5000
});

// Custom HTTP Metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests received',
  labelNames: ['method', 'route', 'status_code']
});

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

// Custom gRPC Metrics
const grpcRequestsTotal = new promClient.Counter({
  name: 'grpc_requests_total',
  help: 'Total number of gRPC requests handled',
  labelNames: ['method', 'status']
});

const grpcRequestDuration = new promClient.Histogram({
  name: 'grpc_request_duration_seconds',
  help: 'Duration of gRPC requests in seconds',
  labelNames: ['method', 'status'],
  buckets: [0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
});

// Circuit Breaker Metrics
const circuitBreakerState = new promClient.Gauge({
  name: 'circuit_breaker_state',
  help: 'State of the opossum circuit breaker (0: closed, 1: halfOpen, 2: open)',
  labelNames: ['breaker_name']
});

const circuitBreakerStats = new promClient.Counter({
  name: 'circuit_breaker_events_total',
  help: 'Total count of circuit breaker events',
  labelNames: ['breaker_name', 'event']
});

function httpMetricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    // Avoid tracking metrics endpoint to prevent noise
    if (req.path === '/metrics') return;

    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode
    });

    httpRequestDuration.observe(
      {
        method: req.method,
        route,
        status_code: statusCode
      },
      durationInSeconds
    );
  });

  next();
}

module.exports = {
  promClient,
  httpMetricsMiddleware,
  httpRequestsTotal,
  httpRequestDuration,
  grpcRequestsTotal,
  grpcRequestDuration,
  circuitBreakerState,
  circuitBreakerStats
};
