// Purpose: manage a user's private profile image through authenticated mailbox sessions.

import express from 'express';
import { User } from '../models.js';
import { getAvatarDataUrl } from '../profile-image.js';
import { requireBrowserSession } from './session-auth.js';

/** Accept only small, browser-renderable images to bound account and request storage. */
const profileImageParser = express.raw({ type: 'image/*', limit: '350kb' });
/** Limit stored profile image formats to common web-safe raster types. */
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Create the session-protected profile image router. */
export function createProfileRouter() {
  const router = express.Router();
  router.use(requireBrowserSession);

  /** Store one validated profile image and return its display URL to the caller. */
  router.put('/picture', profileImageParser, async (request, response, next) => {
    try {
      const mimeType = request.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!Buffer.isBuffer(request.body) || !ALLOWED_PROFILE_IMAGE_TYPES.has(mimeType)) {
        response.status(415).json({ error: 'profile_image_type_not_supported' });
        return;
      }
      if (request.body.length === 0 || request.body.length > 350 * 1024) {
        response.status(413).json({ error: 'profile_image_size_invalid' });
        return;
      }

      const user = await User.findByIdAndUpdate(request.meowUser.userId, {
        $set: { avatarData: request.body, avatarMimeType: mimeType },
      }, { new: true }).select('+avatarData +avatarMimeType');
      if (!user) {
        response.status(404).json({ error: 'account_not_found' });
        return;
      }
      response.json({ avatarUrl: getAvatarDataUrl(user) });
    } catch (error) {
      next(error);
    }
  });

  /** Remove the caller's profile image and fall back to an initial avatar. */
  router.delete('/picture', async (request, response, next) => {
    try {
      await User.updateOne({ _id: request.meowUser.userId }, {
        $set: { avatarData: null, avatarMimeType: null },
      });
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
