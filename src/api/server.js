// Purpose: start the HTTP API after MongoDB is reachable and stop it cleanly on shutdown.

import { config } from '../config.js';
import { connectMongo, disconnectMongo } from '../mongo.js';
import { createApp } from './app.js';

/** Connect persistence, start Express, and register process-level shutdown handlers. */
async function startApi() {
  await connectMongo();
  const app = createApp();
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.info(JSON.stringify({ level: 'info', service: 'api', message: 'listening', port: config.port }));
  });

  /** Close HTTP and MongoDB resources in order when Docker stops the API container. */
  const stopApi = async () => {
    server.close(async () => {
      await disconnectMongo();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', stopApi);
  process.on('SIGTERM', stopApi);
}

startApi().catch((error) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'api', message: error.message }));
  process.exit(1);
});
