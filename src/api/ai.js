// Purpose: expose session-protected, rate-limited OpenRouter translation and reply tools.

import express from 'express';
import rateLimit from 'express-rate-limit';
import { AI_LANGUAGES, getAiStatus, suggestEmailReplies, translateEmailText } from '../ai.js';
import { requireBrowserSession } from './session-auth.js';

/** Create a small per-source limit to preserve free model quota. */
const aiRateLimiter = rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false });

/** Create the authenticated router for optional AI productivity tools. */
export function createAiRouter() {
  const router = express.Router();
  router.use(requireBrowserSession);

  /** Return the safe public AI setup state without exposing a provider key. */
  router.get('/status', (_request, response) => {
    response.json(getAiStatus());
  });

  /** Translate explicitly submitted text into one of the supported target languages. */
  router.post('/translate', aiRateLimiter, async (request, response, next) => {
    try {
      const text = request.body?.text;
      const targetLanguage = request.body?.targetLanguage;
      const sourceLanguage = request.body?.sourceLanguage ?? 'Auto-detect';
      if (typeof text !== 'string' || !text.trim() || text.length > 15_000) {
        response.status(400).json({ error: 'text must contain 1 to 15000 characters' });
        return;
      }
      if (!AI_LANGUAGES.includes(targetLanguage)) {
        response.status(400).json({ error: 'unsupported_target_language' });
        return;
      }
      if (sourceLanguage !== 'Auto-detect' && !AI_LANGUAGES.includes(sourceLanguage)) {
        response.status(400).json({ error: 'unsupported_source_language' });
        return;
      }
      const translation = await translateEmailText(text.trim(), targetLanguage, sourceLanguage);
      response.json({ translation, targetLanguage });
    } catch (error) {
      next(error);
    }
  });

  /** Suggest short replies using only the email text the signed-in user selected. */
  router.post('/replies', aiRateLimiter, async (request, response, next) => {
    try {
      const text = request.body?.text;
      const language = request.body?.language ?? 'English';
      if (typeof text !== 'string' || !text.trim() || text.length > 10_000) {
        response.status(400).json({ error: 'text must contain 1 to 10000 characters' });
        return;
      }
      if (!AI_LANGUAGES.includes(language)) {
        response.status(400).json({ error: 'unsupported_language' });
        return;
      }
      response.json({ replies: await suggestEmailReplies(text.trim(), language) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
