// Purpose: require a valid browser session for private mailbox endpoints.

import { findBrowserSessionUser } from '../auth-session.js';

/** Attach the signed-in ईMAIL identity or return a structured authentication error. */
export async function requireBrowserSession(request, response, next) {
  try {
    const user = await findBrowserSessionUser(request);
    if (!user) {
      response.status(401).json({ error: 'not_authenticated' });
      return;
    }
    request.meowUser = user;
    next();
  } catch (error) {
    next(error);
  }
}
