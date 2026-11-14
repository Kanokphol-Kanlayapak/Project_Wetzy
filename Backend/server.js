require('dotenv').config();

const { createApp } = require('./src/app');
const { readConfig } = require('./src/config/env');

const config = readConfig();
const app = createApp(config);

app.listen(config.port, '0.0.0.0', () => {
  console.log(`Wetzy API listening on port ${config.port}`);
});
