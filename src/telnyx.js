// Purpose: wrap Telnyx REST calls and signed-webhook verification in one provider adapter.

import Telnyx from 'telnyx';
import { config } from './config.js';

/** Construct the official Telnyx client for cryptographic webhook verification. */
const telnyxClient = new Telnyx({
  apiKey: config.telnyxApiKey,
  publicKey: config.telnyxWebhookPublicKey || undefined,
});

/** Send an authenticated JSON request to a Telnyx v2 API endpoint. */
async function requestTelnyx(path, body) {
  const response = await fetch(`https://api.telnyx.com/v2${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.telnyxApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.errors?.[0]?.detail ?? `Telnyx request failed (${response.status})`);
    error.statusCode = response.status;
    throw error;
  }
  return responseBody.data ?? responseBody;
}

/** Place exactly one outbound call and attach ईMAIL's call ID as webhook client state. */
export async function dialPhone(phoneNumber, clientState) {
  return requestTelnyx('/calls', {
    connection_id: config.telnyxVoiceAppId,
    from: config.telnyxCallerId,
    to: phoneNumber,
    webhook_url: `${config.publicBaseUrl}/webhooks/telnyx/voice`,
    webhook_url_method: 'POST',
    client_state: clientState,
  });
}

/** Issue a Telnyx call-control action for the identified call. */
export async function callAction(callControlId, action, body = {}) {
  return requestTelnyx(`/calls/${encodeURIComponent(callControlId)}/actions/${action}`, body);
}

/** Send an SMS using the configured sender and optional Telnyx messaging profile ID. */
export async function sendSms(phoneNumber, text) {
  const body = {
    from: config.telnyxSmsFromNumber,
    to: phoneNumber,
    text,
    use_profile_webhooks: true,
    webhook_url: `${config.publicBaseUrl}/webhooks/telnyx/messaging`,
  };
  if (config.telnyxMessagingProfileId) {
    body.messaging_profile_id = config.telnyxMessagingProfileId;
  }
  return requestTelnyx('/messages', body);
}

/** Verify the exact request body with Telnyx's Ed25519 public-key verifier. */
export async function verifyTelnyxWebhook(rawBody, headers) {
  if (!config.telnyxWebhookPublicKey) {
    throw new Error('TELNYX_WEBHOOK_PUBLIC_KEY must be set before accepting Telnyx webhooks');
  }
  return telnyxClient.webhooks.unwrap(rawBody, { headers });
}
