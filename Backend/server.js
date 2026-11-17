const path = require('node:path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createApp } = require('./src/app');
const { readConfig } = require('./src/config/env');
const { connectMongo } = require('./src/config/mongo');

async function start() {
  const config = readConfig();
  await connectMongo(config.mongoUri);

  const app = createApp(config);
  await app.locals.authService?.ensureSeedSuperAdmin?.();

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`Wetzy API listening on port ${config.port}`);
      resolve(server);
    });
    server.once('error', reject);
  });
}

if (require.main === module) {
  start().catch(async (error) => {
    console.error('Wetzy Backend startup failed:', error.message);
    try {
      await mongoose.disconnect();
    } catch (disconnectError) {
      console.error('MongoDB disconnect failed:', disconnectError.message);
    }
    process.exitCode = 1;
  });
}

module.exports = { start };
