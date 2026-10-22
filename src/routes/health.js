const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

router.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  // readyState: 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isDbHealthy = dbState === 1;

  const healthData = {
    status: isDbHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
    service: 'restaurant-service',
    checks: {
      database: {
        status: isDbHealthy ? 'UP' : 'DOWN',
        readyState: dbState,
        description: isDbHealthy ? 'Connected to MongoDB' : 'Disconnected from MongoDB'
      },
      grpc: {
        status: 'UP',
        port: 50051
      }
    }
  };

  if (req.log) {
    req.log.debug({ health: healthData }, 'Health check executed');
  }

  const statusCode = isDbHealthy ? 200 : 503;
  return res.status(statusCode).json(healthData);
});

module.exports = router;
