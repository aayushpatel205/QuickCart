require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8082', 10),
  grpcPort: parseInt(process.env.GRPC_PORT || '50051', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurantdb',
  jwtSecret: process.env.JWT_SECRET || 'quickcart-super-secret-jwt-key-2026',
  serviceName: 'restaurant-service',
  logLevel: process.env.LOG_LEVEL || 'info',
  // Circuit breaker settings for MongoDB calls
  circuitBreaker: {
    timeout: parseInt(process.env.CB_TIMEOUT_MS || '3000', 10), // ms
    errorThresholdPercentage: parseInt(process.env.CB_ERROR_THRESHOLD || '50', 10), // 50%
    resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT_MS || '5000', 10) // 5s before half-open
  }
};
