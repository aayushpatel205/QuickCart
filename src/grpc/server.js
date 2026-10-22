const path = require('path');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const config = require('../config');
const { logger, createChildLogger } = require('../utils/logger');
const { restaurantQueryBreaker } = require('./circuitBreaker');
const { grpcRequestsTotal, grpcRequestDuration } = require('../middleware/metrics');

const PROTO_PATH = path.resolve(__dirname, '../../proto/menu.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false, // use camelCase in JavaScript
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const quickcartProto = protoDescriptor.quickcart;

/**
 * ValidateItems RPC Handler
 */
async function validateItems(call, callback) {
  const start = process.hrtime();
  const request = call.request || {};
  const { restaurantId, items = [] } = request;

  // Extract correlationId / orderId from gRPC metadata if provided
  const metadata = call.metadata ? call.metadata.getMap() : {};
  const correlationId = metadata['x-correlation-id'] || null;
  const orderId = metadata['x-order-id'] || null;
  const rpcLogger = createChildLogger(correlationId, orderId);

  rpcLogger.info(
    { restaurantId, itemCount: items.length },
    'gRPC ValidateItems request received'
  );

  function finish(status, response) {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    grpcRequestsTotal.inc({ method: 'ValidateItems', status });
    grpcRequestDuration.observe({ method: 'ValidateItems', status }, durationInSeconds);
    return callback(null, response);
  }

  // Basic validation of incoming request
  if (!restaurantId || !Array.isArray(items) || items.length === 0) {
    rpcLogger.warn({ restaurantId, items }, 'Invalid gRPC validation request: missing restaurantId or items');
    return finish('INVALID_ARGUMENT', {
      valid: false,
      totalPrice: 0.0,
      message: 'Validation failed: restaurantId and at least one item are required'
    });
  }

  try {
    // Execute MongoDB lookup wrapped by Opossum Circuit Breaker
    const restaurant = await restaurantQueryBreaker.fire(restaurantId);

    // Check if circuit breaker fallback was returned
    if (restaurant && restaurant._isFallback) {
      rpcLogger.warn(
        { restaurantId, reason: restaurant.reason },
        'Circuit breaker fallback triggered during item validation'
      );
      return finish('CIRCUIT_OPEN', {
        valid: false,
        totalPrice: 0.0,
        message: `Service temporarily unavailable: Menu validation fallback triggered (${restaurant.reason})`
      });
    }

    if (!restaurant) {
      rpcLogger.warn({ restaurantId }, 'Restaurant not found for validation');
      return finish('NOT_FOUND', {
        valid: false,
        totalPrice: 0.0,
        message: `Restaurant with ID '${restaurantId}' does not exist`
      });
    }

    // Build item map from DB items
    const dbItemMap = new Map();
    for (const it of restaurant.items || []) {
      dbItemMap.set(it.itemId, it);
    }

    let calculatedTotalPrice = 0.0;

    // Validate each requested item
    for (const reqItem of items) {
      const dbItem = dbItemMap.get(reqItem.itemId);

      if (!dbItem) {
        rpcLogger.warn(
          { restaurantId, itemId: reqItem.itemId },
          'Item does not exist in restaurant menu'
        );
        return finish('ITEM_NOT_FOUND', {
          valid: false,
          totalPrice: 0.0,
          message: `Item '${reqItem.itemId}' does not exist on restaurant '${restaurantId}' menu`
        });
      }

      if (!dbItem.available) {
        rpcLogger.warn(
          { restaurantId, itemId: reqItem.itemId, itemName: dbItem.name },
          'Item is currently unavailable'
        );
        return finish('ITEM_UNAVAILABLE', {
          valid: false,
          totalPrice: 0.0,
          message: `Item '${dbItem.name}' (${reqItem.itemId}) is currently marked unavailable`
        });
      }

      const qty = parseInt(reqItem.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        return finish('INVALID_QTY', {
          valid: false,
          totalPrice: 0.0,
          message: `Quantity for item '${reqItem.itemId}' must be greater than 0`
        });
      }

      // Calculate price strictly from DB price (never trust client prices)
      calculatedTotalPrice += dbItem.price * qty;
    }

    // Round total price to 2 decimal places
    const finalTotalPrice = Math.round(calculatedTotalPrice * 100) / 100;

    rpcLogger.info(
      { restaurantId, itemCount: items.length, finalTotalPrice },
      'gRPC ValidateItems succeeded'
    );

    return finish('OK', {
      valid: true,
      totalPrice: finalTotalPrice,
      message: 'All items successfully verified and available'
    });
  } catch (error) {
    rpcLogger.error({ error: error.message, restaurantId }, 'Unexpected gRPC ValidateItems error');
    return finish('INTERNAL_ERROR', {
      valid: false,
      totalPrice: 0.0,
      message: `Internal validation error: ${error.message}`
    });
  }
}

let serverInstance = null;

function startGrpcServer() {
  const server = new grpc.Server();
  server.addService(quickcartProto.MenuService.service, {
    validateItems
  });

  const bindAddress = `0.0.0.0:${config.grpcPort}`;
  server.bindAsync(bindAddress, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error({ err }, 'Failed to bind gRPC server');
      throw err;
    }
    logger.info({ grpcPort: port }, 'gRPC MenuService listening');
  });

  serverInstance = server;
  return server;
}

function stopGrpcServer() {
  if (serverInstance) {
    serverInstance.forceShutdown();
    logger.info('gRPC server stopped');
  }
}

module.exports = {
  startGrpcServer,
  stopGrpcServer
};
