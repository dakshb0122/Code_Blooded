// Purpose: protect ईMAIL's service-to-service API routes with the local bearer token.

import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/** Require a constant-time match for the configured ईMAIL API bearer token. */
export function requireApiToken(request, response, next) {
  const authorization = request.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expectedBytes = Buffer.from(config.callsApiToken);
  const suppliedBytes = Buffer.from(suppliedToken);
  const isAuthorized = suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);

  if (!isAuthorized) {
    response.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}
