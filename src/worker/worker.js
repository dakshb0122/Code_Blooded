// Purpose: poll durable MongoDB call records and dispatch one Telnyx call without retries.

import { setTimeout as sleep } from 'node:timers/promises';
import { connectMongo, disconnectMongo } from '../mongo.js';
import { CallRecord } from '../models.js';
import { dispatchCall } from './dispatch.js';

/** Remember whether Docker has requested a graceful worker shutdown. */
let isShuttingDown = false;

/** Mark interrupted dispatches unknown and never redial them after a worker restart. */
async function markInterruptedDispatches() {
  const interruptedCalls = await CallRecord.find({ status: 'dispatching' }).select('_id').lean();
  for (const interruptedCall of interruptedCalls) {
    await CallRecord.updateOne(
      { _id: interruptedCall._id, status: 'dispatching' },
      { $set: { status: 'dispatch_unknown', failureReason: 'worker_stopped_during_dispatch' } },
    );
  }
}

/** Atomically claim one queued request, dispatch it once, and poll when the queue is empty. */
async function runWorker() {
  await connectMongo();
  await markInterruptedDispatches();
  console.info(JSON.stringify({ level: 'info', service: 'call-worker', message: 'started' }));

  while (!isShuttingDown) {
    const callRecord = await CallRecord.findOneAndUpdate(
      { status: 'queued' },
      { $set: { status: 'dispatching', dispatchStartedAt: new Date() } },
      { sort: { createdAt: 1 }, new: true },
    );
    if (!callRecord) {
      await sleep(750);
      continue;
    }

    try {
      await dispatchCall(callRecord);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', service: 'call-worker', callId: callRecord.id, message: 'call_dispatch_failed' }));
      const providerRejectedCall = error.statusCode >= 400 && error.statusCode < 500;
      const update = {
        $set: {
          status: providerRejectedCall ? 'failed' : 'dispatch_unknown',
          failureReason: providerRejectedCall ? 'provider_rejected_call' : 'provider_dispatch_outcome_unknown',
        },
      };
      if (providerRejectedCall) {
        update.$set.completedAt = new Date();
        update.$unset = { activePhoneNumber: 1 };
      }
      await CallRecord.updateOne({ _id: callRecord._id }, update);
    }
  }
  await disconnectMongo();
}

/** Shut down the worker process after finishing its active provider request. */
async function stopWorker() {
  isShuttingDown = true;
}

process.on('SIGINT', stopWorker);
process.on('SIGTERM', stopWorker);
runWorker().catch(async (error) => {
  console.error(JSON.stringify({ level: 'fatal', service: 'call-worker', message: error.message }));
  await disconnectMongo().catch(() => {});
  process.exit(1);
});
