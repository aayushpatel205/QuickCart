const CircuitBreaker = require('opossum');
const Restaurant = require('../db/models/Restaurant');
const config = require('../config');
const { logger } = require('../utils/logger');
const { circuitBreakerState, circuitBreakerStats } = require('../middleware/metrics');

/**
 * Underlying MongoDB query function to be protected by circuit breaker
 */
async function queryRestaurantFromDb(restaurantId) {
  return await Restaurant.findById(restaurantId).lean().exec();
}

const breakerOptions = {
  timeout: config.circuitBreaker.timeout, // If MongoDB query takes > 3000ms, trigger timeout
  errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage, // When 50% fail, open breaker
  resetTimeout: config.circuitBreaker.resetTimeout, // After 5000ms, try half-open
  name: 'mongo_menu_validator'
};

const restaurantQueryBreaker = new CircuitBreaker(queryRestaurantFromDb, breakerOptions);

// Define fallback response when breaker is open or timeout occurs
restaurantQueryBreaker.fallback((restaurantId, err) => {
  logger.warn(
    {
      restaurantId,
      error: err ? err.message : 'Circuit breaker open/timeout',
      breakerState: restaurantQueryBreaker.opened ? 'OPEN' : 'HALF_OPEN'
    },
    'Circuit breaker fallback invoked for MongoDB lookup'
  );

  return {
    _isFallback: true,
    reason: err ? err.message : 'Database query failed or timed out (Circuit OPEN)'
  };
});

// Event listeners for metrics and structured logging
restaurantQueryBreaker.on('open', () => {
  logger.warn({ breaker: breakerOptions.name }, 'Circuit breaker OPENED - failing fast to fallback');
  circuitBreakerState.set({ breaker_name: breakerOptions.name }, 2);
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'open' });
});

restaurantQueryBreaker.on('halfOpen', () => {
  logger.info({ breaker: breakerOptions.name }, 'Circuit breaker HALF-OPEN - probing database health');
  circuitBreakerState.set({ breaker_name: breakerOptions.name }, 1);
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'halfOpen' });
});

restaurantQueryBreaker.on('close', () => {
  logger.info({ breaker: breakerOptions.name }, 'Circuit breaker CLOSED - database healthy');
  circuitBreakerState.set({ breaker_name: breakerOptions.name }, 0);
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'close' });
});

restaurantQueryBreaker.on('fallback', (result) => {
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'fallback' });
});

restaurantQueryBreaker.on('success', () => {
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'success' });
});

restaurantQueryBreaker.on('failure', (err) => {
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'failure' });
});

restaurantQueryBreaker.on('timeout', () => {
  logger.error({ breaker: breakerOptions.name }, 'Circuit breaker query TIMED OUT');
  circuitBreakerStats.inc({ breaker_name: breakerOptions.name, event: 'timeout' });
});

// Initial state gauge
circuitBreakerState.set({ breaker_name: breakerOptions.name }, 0);

module.exports = {
  restaurantQueryBreaker
};
