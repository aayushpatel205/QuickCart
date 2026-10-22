const pino = require('pino');
const config = require('../config');

const isDev = config.env === 'development' && process.env.PINO_PRETTY === 'true';

const logger = pino({
  level: config.logLevel,
  base: {
    service: config.serviceName,
    env: config.env
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard'
          }
        }
      }
    : {})
});

// Helper to create child logger with correlationId and orderId
function createChildLogger(correlationId, orderId) {
  const bindings = {};
  if (correlationId) bindings.correlationId = correlationId;
  if (orderId) bindings.orderId = orderId;
  return logger.child(bindings);
}

module.exports = {
  logger,
  createChildLogger
};
