// Purpose: compose ईMAIL REST routes, provider webhooks, security middleware, and error handling.

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { config } from '../config.js';
import { permanentlyDeleteAccount } from '../account.js';
import { isMongoConnected } from '../mongo.js';
import { CallRecord, User, WebhookReceipt } from '../models.js';
import { normalizeIndianPhone, phoneToEmailAddress } from '../phone.js';
import { issuePasswordReset, resetPassword } from '../password-reset.js';
import { handleVoiceEvent, storeProviderEvent } from '../ivr.js';
import { verifyTelnyxWebhook } from '../telnyx.js';
import { requireApiToken } from './auth.js';
import { createAiRouter } from './ai.js';
import { createMailRouter } from './mail.js';
import { createProfileRouter } from './profile.js';
import { getAvatarDataUrl } from '../profile-image.js';
import {
  clearBrowserSessionCookie,
  createBrowserSession,
  findBrowserSessionUser,
  revokeBrowserSession,
  setBrowserSessionCookie,
} from '../auth-session.js';

/** Preserve the full Helmet policy when requests arrive over trusted HTTPS. */
const httpsSecurityHeaders = helmet();
/** Disable HTTPS-only browser features on the HTTP LAN origin while retaining the other security headers. */
const lanHttpSecurityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginOpenerPolicy: false,
  hsts: false,
  originAgentCluster: false,
});

/** Construct the Express application and register all API routes. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  /** Trust one local Tailscale proxy hop for source-IP limits and HTTPS cookie detection. */
  app.set('trust proxy', 1);
  /** Select headers for the request transport so LAN assets stay on HTTP and Funnel remains HTTPS-hardened. */
  app.use(function applyTransportSecurityHeaders(request, response, next) {
    const securityHeaders = request.secure ? httpsSecurityHeaders : lanHttpSecurityHeaders;
    securityHeaders(request, response, next);
  });

  /** Preserve raw JSON bytes on signed provider callbacks before parsing ordinary API JSON. */
  app.post('/webhooks/telnyx/voice', express.raw({ type: 'application/json', limit: '1mb' }), async (request, response) => {
    await processTelnyxWebhook(request, response, 'voice');
  });
  /** Preserve raw JSON bytes on signed messaging callbacks before parsing ordinary API JSON. */
  app.post('/webhooks/telnyx/messaging', express.raw({ type: 'application/json', limit: '1mb' }), async (request, response) => {
    await processTelnyxWebhook(request, response, 'messaging');
  });

  /** Permit bounded base64 file attachments in mailbox requests. */
  app.use(express.json({ limit: '8mb' }));

  /** Limit call-start requests per source to reduce accidental or abusive dial bursts. */
  const callsRateLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  /** Limit password-reset submissions without interfering with signed provider callbacks. */
  const resetRateLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  /** Throttle public requests that can make ईMAIL place an outbound phone call. */
  const onboardingCallRateLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
  /** Limit repeated password guesses for one browser source. */
  const loginRateLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
  /** Limit SMS OTP requests to reduce unwanted messages and provider charges. */
  const passwordOtpRateLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });
  /** Limit password-confirmed permanent account deletion attempts. */
  const accountDeleteRateLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 3, standardHeaders: 'draft-8', legacyHeaders: false });

  /** Expose process liveness without revealing dependency or environment details. */
  app.get('/healthz', (_request, response) => response.status(200).json({ status: 'alive' }));
  /** Expose database readiness for local orchestration health checks. */
  app.get('/readyz', (_request, response) => response.status(isMongoConnected() ? 200 : 503).json({
    status: isMongoConnected() ? 'ready' : 'not_ready',
    mongo: isMongoConnected() ? 'connected' : 'disconnected',
  }));

  /** Start account enrollment by calling a validated Indian number without exposing the internal token. */
  app.post('/api/v1/onboarding/calls', onboardingCallRateLimiter, async (request, response, next) => {
    try {
      const phoneNumber = normalizeIndianPhone(request.body?.phoneNumber);
      /** Reclaim completed IVR calls whose final hangup webhook was never delivered. */
      const staleFinalEventCutoff = new Date(Date.now() - 2 * 60_000);
      await CallRecord.updateMany(
        {
          phoneNumber,
          status: 'active',
          menuStage: 'done',
          lastEventAt: { $lt: staleFinalEventCutoff },
        },
        {
          $set: { status: 'completed', completedAt: new Date(), failureReason: null },
          $unset: { activePhoneNumber: 1 },
        },
      );
      /** Release abandoned reservations when a call never sends its final provider event. */
      const staleCallCutoff = new Date(Date.now() - 5 * 60_000);
      const staleDispatchCutoff = new Date(Date.now() - 15 * 60_000);
      await CallRecord.updateMany(
        {
          phoneNumber,
          activePhoneNumber: phoneNumber,
          status: { $in: ['queued', 'initiated', 'ringing', 'active'] },
          $or: [
            { lastEventAt: { $lt: staleCallCutoff } },
            { lastEventAt: null, updatedAt: { $lt: staleCallCutoff } },
          ],
        },
        {
          $set: { status: 'failed', completedAt: new Date(), failureReason: 'stale_call_timeout' },
          $unset: { activePhoneNumber: 1 },
        },
      );
      /** Dispatch outcomes can be ambiguous; keep their reservation briefly before allowing a retry. */
      await CallRecord.updateMany(
        {
          phoneNumber,
          activePhoneNumber: phoneNumber,
          status: { $in: ['dispatching', 'dispatch_unknown'] },
          $or: [
            { dispatchStartedAt: { $lt: staleDispatchCutoff } },
            { dispatchStartedAt: null, updatedAt: { $lt: staleDispatchCutoff } },
          ],
        },
        {
          $set: { status: 'failed', completedAt: new Date(), failureReason: 'stale_dispatch_timeout' },
          $unset: { activePhoneNumber: 1 },
        },
      );
      const callRecord = await CallRecord.create({ phoneNumber, activePhoneNumber: phoneNumber, status: 'queued' });
      response.status(202).json({ callId: callRecord.id, status: callRecord.status, phoneNumber: callRecord.phoneNumber });
    } catch (error) {
      if (error.code === 11000) {
        response.status(409).json({ error: 'active_call_exists', message: 'A call is already active for this phone number.' });
        return;
      }
      next(error);
    }
  });

  /** Return limited status for a call started by the public enrollment flow. */
  app.get('/api/v1/onboarding/calls/:callId', async (request, response, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(request.params.callId)) {
        response.status(400).json({ error: 'invalid_call_id' });
        return;
      }
      const callRecord = await CallRecord.findById(request.params.callId).select('phoneNumber status language selectedOption failureReason').lean();
      if (!callRecord) {
        response.status(404).json({ error: 'call_not_found' });
        return;
      }
      const { phoneNumber, ...publicCallRecord } = callRecord;
      response.json({
        callId: request.params.callId,
        ...publicCallRecord,
        ...(publicCallRecord.selectedOption === 'account_created'
          ? { username: phoneToEmailAddress(phoneNumber) }
          : {}),
      });
    } catch (error) {
      next(error);
    }
  });

  /** Verify a phone/password pair and issue a browser-only HTTP-only cookie session. */
  app.post('/api/v1/auth/login', loginRateLimiter, async (request, response, next) => {
    try {
      const phoneNumber = normalizeIndianPhone(request.body?.phoneNumber);
      const password = request.body?.password;
      if (typeof password !== 'string' || password.length < 1 || password.length > 128) {
        response.status(400).json({ error: 'password must contain 1 to 128 characters' });
        return;
      }

      const user = await User.findOne({ phoneNumber }).select('+avatarData +avatarMimeType');
      const passwordMatches = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!passwordMatches) {
        response.status(401).json({ error: 'invalid_credentials' });
        return;
      }

      const session = await createBrowserSession(user._id);
      setBrowserSessionCookie(response, session.token, session.expiresAt, request.secure);
      response.json({ user: {
        username: user.emailAddress,
        phoneNumber: user.phoneNumber,
        emailAddress: user.emailAddress,
        avatarUrl: getAvatarDataUrl(user),
      }, expiresAt: session.expiresAt });
    } catch (error) {
      next(error);
    }
  });

  /** Return the signed-in user's public identity or clear an invalid browser cookie. */
  app.get('/api/v1/auth/session', async (request, response, next) => {
    try {
      const user = await findBrowserSessionUser(request);
      if (!user) {
        clearBrowserSessionCookie(response, request.secure);
        response.status(401).json({ error: 'not_authenticated' });
        return;
      }
      response.json({ user: {
        username: user.emailAddress,
        phoneNumber: user.phoneNumber,
        emailAddress: user.emailAddress,
        avatarUrl: user.avatarUrl,
      } });
    } catch (error) {
      next(error);
    }
  });

  /** Revoke the active browser session and expire its cookie. */
  app.post('/api/v1/auth/logout', async (request, response, next) => {
    try {
      await revokeBrowserSession(request);
      clearBrowserSessionCookie(response, request.secure);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /** Permanently delete the signed-in account after password and email confirmation. */
  app.delete('/api/v1/auth/account', accountDeleteRateLimiter, async (request, response, next) => {
    try {
      const user = await findBrowserSessionUser(request);
      if (!user) {
        clearBrowserSessionCookie(response, request.secure);
        response.status(401).json({ error: 'not_authenticated' });
        return;
      }
      await permanentlyDeleteAccount(user.userId, request.body ?? {});
      clearBrowserSessionCookie(response, request.secure);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /** Send a password setup/reset OTP without revealing whether a phone is registered. */
  app.post('/api/v1/auth/password-reset/request', passwordOtpRateLimiter, async (request, response, next) => {
    try {
      const phoneNumber = normalizeIndianPhone(request.body?.phoneNumber);
      await issuePasswordReset(phoneNumber);
      response.status(202).json({ message: 'If an account exists for this number, a code has been sent by SMS.' });
    } catch (error) {
      next(error);
    }
  });

  /** Validate and persist one outbound call request for the separate worker. */
  app.post('/api/v1/calls', requireApiToken, callsRateLimiter, async (request, response, next) => {
    try {
      const phoneNumber = normalizeIndianPhone(request.body?.phoneNumber);
      const callRecord = await CallRecord.create({ phoneNumber, activePhoneNumber: phoneNumber, status: 'queued' });
      response.status(202).json({ callId: callRecord.id, status: callRecord.status, phoneNumber: callRecord.phoneNumber });
    } catch (error) {
      if (error.code === 11000) {
        response.status(409).json({ error: 'active_call_exists', message: 'An active call already exists for this phone number.' });
        return;
      }
      next(error);
    }
  });

  /** Return persisted status for a call without exposing provider credentials or payloads. */
  app.get('/api/v1/calls/:callId', requireApiToken, async (request, response, next) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(request.params.callId)) {
        response.status(400).json({ error: 'invalid_call_id' });
        return;
      }
      const callRecord = await CallRecord.findById(request.params.callId).lean();
      if (!callRecord) {
        response.status(404).json({ error: 'call_not_found' });
        return;
      }
      response.json({
        callId: callRecord._id,
        phoneNumber: callRecord.phoneNumber,
        status: callRecord.status,
        language: callRecord.language,
        selectedOption: callRecord.selectedOption,
        failureReason: callRecord.failureReason,
        createdAt: callRecord.createdAt,
        completedAt: callRecord.completedAt,
      });
    } catch (error) {
      next(error);
    }
  });

  /** Accept an SMS-proven OTP to set a password for a phone-only account. */
  app.post('/api/v1/passwords/reset', resetRateLimiter, async (request, response, next) => {
    try {
      const phoneNumber = normalizeIndianPhone(request.body?.phoneNumber);
      const otp = request.body?.otp;
      const newPassword = request.body?.newPassword;
      if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
        response.status(400).json({ error: 'otp must contain exactly 6 digits' });
        return;
      }
      if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
        response.status(400).json({ error: 'newPassword must contain 6 to 128 characters' });
        return;
      }
      await resetPassword({ phoneNumber, otp, newPassword });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /** Mount browser-session protected internal email endpoints. */
  app.use('/api/v1/mail', createMailRouter());
  /** Mount browser-session protected AI endpoints. */
  app.use('/api/v1/ai', createAiRouter());
  /** Mount browser-session protected profile image endpoints. */
  app.use('/api/v1/profile', createProfileRouter());

  /** Serve the browser frontend through the API origin while keeping its container private. */
  app.use(createProxyMiddleware({
    target: 'http://frontend:8080',
    changeOrigin: true,
    /** Keep API and webhook paths out of the frontend's single-page fallback. */
    pathFilter: (path) => !path.startsWith('/api/') && !path.startsWith('/webhooks/'),
  }));

  /** Return a compact JSON response for paths that are not part of the API surface. */
  app.use((_request, response) => response.status(404).json({ error: 'not_found' }));

  app.use((error, _request, response, _next) => {
    const statusCode = Number.isInteger(error.statusCode)
      ? error.statusCode
      : Number.isInteger(error.status)
        ? error.status
        : 500;
    const publicMessage = statusCode >= 500 ? 'internal_server_error' : error.message;
    console.error(JSON.stringify({ level: 'error', message: statusCode >= 500 ? publicMessage : 'request_rejected', statusCode }));
    response.status(statusCode).json({ error: publicMessage });
  });
  return app;
}

/** Verify, deduplicate, persist, and dispatch one signed Telnyx callback. */
async function processTelnyxWebhook(request, response, expectedKind) {
  console.info(JSON.stringify({
    level: 'info',
    message: 'telnyx_webhook_received',
    kind: expectedKind,
    contentLength: request.headers['content-length'] ?? null,
  }));
  if (!config.telnyxWebhookPublicKey) {
    response.status(503).json({ error: 'telnyx_webhook_key_not_configured' });
    return;
  }
  if (!Buffer.isBuffer(request.body)) {
    response.status(415).json({ error: 'expected_application_json' });
    return;
  }

  /** Preserve the exact request bytes as text for Telnyx Ed25519 signature verification. */
  const rawBody = request.body.toString('utf8');
  let event;
  try {
    event = await verifyTelnyxWebhook(rawBody, request.headers);
  } catch {
    console.error(JSON.stringify({ level: 'warn', message: 'telnyx_webhook_signature_rejected', kind: expectedKind }));
    response.status(401).json({ error: 'invalid_telnyx_signature' });
    return;
  }

  /** Validate, deduplicate, and handle the authenticated event with retryable server errors. */
  let eventData;
  let receipt;
  try {
    eventData = event.data ?? {};
    if (typeof eventData.id !== 'string' || typeof eventData.event_type !== 'string') {
      response.status(400).json({ error: 'invalid_telnyx_event' });
      return;
    }
    console.info(JSON.stringify({
      level: 'info',
      message: 'telnyx_webhook_verified',
      kind: expectedKind,
      eventType: eventData.event_type,
    }));

    receipt = await WebhookReceipt.findOneAndUpdate(
      { providerEventId: eventData.id },
      { $setOnInsert: { providerEventId: eventData.id, eventType: eventData.event_type, state: 'received' } },
      { upsert: true, new: true },
    );
    if (receipt.state === 'processed') {
      response.status(200).send('OK');
      return;
    }

    if (expectedKind === 'voice') {
      if (eventData.event_type.startsWith('call.')) await handleVoiceEvent(eventData);
      else await storeProviderEvent(eventData, 'voice');
    } else {
      await storeProviderEvent(eventData, 'messaging');
    }
    receipt.state = 'processed';
    receipt.lastError = null;
    await receipt.save();
    response.status(200).send('OK');
  } catch (error) {
    if (receipt?.providerEventId) {
      receipt.state = 'received';
      receipt.lastError = 'processing_failed';
      await receipt.save().catch(() => {});
    }
    console.error(JSON.stringify({
      level: 'error',
      message: 'telnyx_webhook_processing_failed',
      kind: expectedKind,
      statusCode: error.statusCode ?? null,
      errorName: error.name ?? 'Error',
    }));
    response.status(500).json({ error: 'webhook_processing_failed' });
  }
}
