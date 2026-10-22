const express = require('express');
const config = require('./config');
const { logger } = require('./utils/logger');
const { connectDB, disconnectDB } = require('./db/connection');
const correlationIdMiddleware = require('./middleware/correlationId');
const { httpMetricsMiddleware } = require('./middleware/metrics');
const { extractUserHeaders } = require('./middleware/auth');
const healthRoutes = require('./routes/health');
const metricsRoutes = require('./routes/metrics');
const restaurantRoutes = require('./routes/restaurants');
const { startGrpcServer, stopGrpcServer } = require('./grpc/server');

const app = express();

// Core middlewares
app.use(express.json());
app.use(correlationIdMiddleware);
app.use(httpMetricsMiddleware);
app.use(extractUserHeaders);

// Mount routes
app.use(healthRoutes);
app.use(metricsRoutes);
app.use('/restaurants', restaurantRoutes);

// Catch-all 404 handler
app.use((req, res) => {
  req.log.warn({ path: req.originalUrl, method: req.method }, 'Route not found');
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  req.log.error({ err, path: req.originalUrl }, 'Unhandled application error');
  res.status(err.status || 500).json({
    success: false,
    error: err.name || 'InternalServerError',
    message: err.message || 'An unexpected error occurred'
  });
});

let httpServer = null;

async function bootstrap() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Start gRPC Server
    startGrpcServer();

    // 3. Start Express REST Server
    httpServer = app.listen(config.port, '0.0.0.0', () => {
      logger.info(
        { port: config.port, env: config.env },
        'Restaurant Service REST server listening'
      );
    });
  } catch (error) {
    logger.fatal({ error: error.message }, 'Failed to start Restaurant Service');
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received. Closing servers gracefully...');

  if (httpServer) {
    httpServer.close(() => {
      logger.info('HTTP REST server closed');
    });
  }

  stopGrpcServer();

  try {
    await disconnectDB();
  } catch (e) {
    logger.error({ err: e.message }, 'Error disconnecting MongoDB during shutdown');
  }

  logger.info('Cleanup complete. Exiting process.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap };
