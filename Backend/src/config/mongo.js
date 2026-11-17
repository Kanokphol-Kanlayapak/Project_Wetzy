const mongoose = require('mongoose');
const User = require('../models/User');

const DATABASE_NAME = 'Wetzy_DB';
const COLLECTION_NAMES = ['User', 'Flood_predictions', 'Notifications', 'system_logs'];

async function ensureCollections() {
  const database = mongoose.connection.db;
  const existingCollections = new Set(
    (await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );

  for (const name of COLLECTION_NAMES) {
    if (!existingCollections.has(name)) {
      await database.createCollection(name);
    }
  }
}

async function connectMongo(mongoUri) {
  if (!mongoUri) {
    throw new Error('MONGODB_URI must be set to connect to MongoDB');
  }

  if (mongoose.connection.readyState !== 1) {
    try {
      await mongoose.connect(mongoUri, {
        dbName: DATABASE_NAME,
      });
    } catch (error) {
      throw new Error(
        `Could not connect using MONGODB_URI. Verify that MongoDB is running and the URI is valid (${error.name}).`,
      );
    }
  }

  if (mongoose.connection.name !== DATABASE_NAME) {
    throw new Error(`MongoDB connection must use the ${DATABASE_NAME} database`);
  }

  try {
    await ensureCollections();
    await User.init();
  } catch (error) {
    await mongoose.disconnect();
    throw error;
  }

  return mongoose;
}

module.exports = { connectMongo, DATABASE_NAME, COLLECTION_NAMES, ensureCollections };
