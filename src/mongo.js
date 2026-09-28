// Purpose: manage the MongoDB connection lifecycle shared by API and worker processes.

import mongoose from 'mongoose';
import { config } from './config.js';
import { CallEvent, CallRecord, PasswordReset, User, WebhookReceipt } from './models.js';

/** Connect to the configured MongoDB instance and wait for its indexes to initialize. */
export async function connectMongo() {
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 10_000 });
  await Promise.all([User.init(), CallRecord.init(), PasswordReset.init(), CallEvent.init(), WebhookReceipt.init()]);
}

/** Close the current MongoDB connection cleanly during container shutdown. */
export async function disconnectMongo() {
  await mongoose.disconnect();
}

/** Report whether Mongoose currently has an active database connection. */
export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}
