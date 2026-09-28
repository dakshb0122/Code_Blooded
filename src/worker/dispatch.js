// Purpose: translate a queued ईMAIL call record into one Telnyx Voice API dial request.

import { CallRecord } from '../models.js';
import { dialPhone } from '../telnyx.js';

/** Place a single outbound call and persist Telnyx identifiers returned by the API. */
export async function dispatchCall(callRecord) {
  const clientState = Buffer.from(JSON.stringify({ callId: callRecord.id })).toString('base64');
  const providerCall = await dialPhone(callRecord.phoneNumber, clientState);
  const providerCallControlId = providerCall.call_control_id;
  if (!providerCallControlId) {
    const error = new Error('Telnyx did not return a call control ID');
    error.statusCode = 502;
    throw error;
  }

  const dispatchUpdate = await CallRecord.updateOne(
    { _id: callRecord._id, status: 'dispatching' },
    { $set: { providerCallControlId, status: 'initiated' } },
  );
  if (dispatchUpdate.modifiedCount === 0) {
    await CallRecord.updateOne({ _id: callRecord._id }, { $set: { providerCallControlId } });
  }
}
