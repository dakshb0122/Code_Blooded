// Purpose: create browser sessions using opaque, hashed tokens stored in MongoDB.

import { createHash, randomBytes } from 'node:crypto';
import { UserSession } from './models.js';
import { config } from './config.js';
import { getAvatarDataUrl } from './profile-image.js';

/** Name the same-origin, HTTP-only cookie used by ईMAIL's browser frontend. */
export const SESSION_COOKIE_NAME = 'meow_session';

/** Hash a session token before it is stored so database reads never expose browser credentials. */
function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Extract the named cookie without requiring a general cookie parser. */
function readCookie(request, cookieName) {
  const cookies = request.get('cookie')?.split(';') ?? [];
  const cookie = cookies.map((entry) => entry.trim()).find((entry) => entry.startsWith(`${cookieName}=`));
  return cookie ? cookie.slice(cookieName.length + 1) : null;
}

/** Generate one high-entropy token and persist only its SHA-256 digest. */
export async function createBrowserSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await UserSession.create({ userId, tokenHash: hashSessionToken(token), expiresAt });
  return { token, expiresAt };
}

/** Resolve an unexpired, unrevoked browser session to its canonical phone username. */
export async function findBrowserSessionUser(request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return null;

  const session = await UserSession.findOne({
    tokenHash: hashSessionToken(token),
    expiresAt: { $gt: new Date() },
    revokedAt: null,
  }).populate({ path: 'userId', select: 'phoneNumber emailAddress +avatarData +avatarMimeType' }).lean();
  return session?.userId ? {
    userId: session.userId._id,
    phoneNumber: session.userId.phoneNumber,
    emailAddress: session.userId.emailAddress,
    avatarUrl: getAvatarDataUrl(session.userId),
  } : null;
}

/** Revoke the presented browser session so a logged-out cookie cannot be reused. */
export async function revokeBrowserSession(request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!token) return;
  await UserSession.updateOne(
    { tokenHash: hashSessionToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Attach the browser session cookie with HTTPS protection when the request is secure. */
export function setBrowserSessionCookie(response, token, expiresAt, isSecure) {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  const secureAttribute = isSecure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secureAttribute}`,
  );
}

/** Remove the browser session cookie after logout or an expired-session response. */
export function clearBrowserSessionCookie(response, isSecure) {
  const secureAttribute = isSecure ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureAttribute}`,
  );
}
