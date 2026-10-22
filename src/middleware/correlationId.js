const crypto = require('crypto');
const { createChildLogger } = require('../utils/logger');

function correlationIdMiddleware(req, res, next) {
  const correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    crypto.randomUUID();

  const orderId =
    req.headers['x-order-id'] ||
    req.query.orderId ||
    req.body?.orderId ||
    null;

  req.correlationId = correlationId;
  req.orderId = orderId;

  // Set correlation ID on response headers
  res.setHeader('X-Correlation-Id', correlationId);

  // Attach structured contextual logger to request
  req.log = createChildLogger(correlationId, orderId);

  next();
}

module.exports = correlationIdMiddleware;
