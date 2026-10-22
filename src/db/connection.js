const mongoose = require('mongoose');
const config = require('../config');
const { logger } = require('../utils/logger');

async function connectDB() {
  try {
    mongoose.set('strictQuery', false);
    const conn = await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true
    });

    logger.info(
      { host: conn.connection.host, name: conn.connection.name },
      'MongoDB connected successfully'
    );

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB runtime error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection disconnected');
    });

    return conn;
  } catch (error) {
    logger.error({ error: error.message }, 'MongoDB initial connection failed');
    throw error;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

module.exports = {
  connectDB,
  disconnectDB
};
