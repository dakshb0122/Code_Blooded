// Purpose: expose authenticated, internal-only email and mailbox operations.

import express from 'express';
import {
  createDraft,
  deleteMailboxAttachment,
  deleteTrashedItem,
  getMailboxAttachment,
  getMailboxItem,
  listMailbox,
  sendMessage,
  uploadMailboxAttachment,
  updateDraft,
  updateMailboxItem,
} from '../mailbox.js';
import { requireBrowserSession } from './session-auth.js';

/** Create the session-protected router for the ईMAIL internal mailbox. */
export function createMailRouter() {
  const router = express.Router();
  router.use(requireBrowserSession);

  /** Accept one bounded raw file upload; GridFS keeps it outside MongoDB message documents. */
  router.post('/attachments', express.raw({ type: '*/*', limit: '15mb' }), async (request, response, next) => {
    try {
      const name = request.query.name;
      const mimeType = request.get('content-type')?.split(';')[0].trim().toLowerCase() ?? 'application/octet-stream';
      response.status(201).json({ attachment: await uploadMailboxAttachment(request.meowUser.userId, name, mimeType, request.body) });
    } catch (error) {
      next(error);
    }
  });

  /** Download an attachment only through a message present in the caller's mailbox. */
  router.get('/attachments/:attachmentId', async (request, response, next) => {
    try {
      const { attachment, file, stream } = await getMailboxAttachment(request.meowUser.userId, request.params.attachmentId);
      const safeInlineTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
      const inline = request.query.inline === '1' && safeInlineTypes.has(attachment.mimeType);
      response.set({
        'Content-Type': safeInlineTypes.has(attachment.mimeType) ? attachment.mimeType : 'application/octet-stream',
        'Content-Length': String(file.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'X-Content-Type-Options': 'nosniff',
      });
      stream.on('error', next);
      stream.pipe(response);
    } catch (error) {
      next(error);
    }
  });

  /** Clean up a newly uploaded file if the user removes it before saving a message. */
  router.delete('/attachments/:attachmentId', async (request, response, next) => {
    try {
      await deleteMailboxAttachment(request.meowUser.userId, request.params.attachmentId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  /** List the caller's messages in one folder, optionally filtering by search text. */
  router.get('/messages', async (request, response, next) => {
    try {
      const items = await listMailbox(request.meowUser.userId, request.query.folder ?? 'inbox', request.query.search ?? '');
      response.json({ messages: items });
    } catch (error) {
      next(error);
    }
  });

  /** Read one message after confirming the caller owns its mailbox copy. */
  router.get('/messages/:itemId', async (request, response, next) => {
    try {
      response.json({ message: await getMailboxItem(request.meowUser.userId, request.params.itemId) });
    } catch (error) {
      next(error);
    }
  });

  /** Send a message only to existing @niti ईMAIL accounts. */
  router.post('/messages', async (request, response, next) => {
    try {
      response.status(201).json(await sendMessage(request.meowUser.userId, request.body ?? {}));
    } catch (error) {
      next(error);
    }
  });

  /** Save a compose window to the signed-in user's Drafts folder. */
  router.post('/drafts', async (request, response, next) => {
    try {
      response.status(201).json({ draft: await createDraft(request.meowUser.userId, request.body ?? {}) });
    } catch (error) {
      next(error);
    }
  });

  /** Update an existing draft while preserving ownership boundaries. */
  router.put('/drafts/:itemId', async (request, response, next) => {
    try {
      response.json({ draft: await updateDraft(request.meowUser.userId, request.params.itemId, request.body ?? {}) });
    } catch (error) {
      next(error);
    }
  });

  /** Deliver a saved draft after validating all recipients and message content. */
  router.post('/drafts/:itemId/send', async (request, response, next) => {
    try {
      response.status(201).json(await sendMessage(request.meowUser.userId, request.body ?? {}, request.params.itemId));
    } catch (error) {
      next(error);
    }
  });

  /** Change only per-user mailbox state such as read, starred, archive, or trash. */
  router.patch('/messages/:itemId', async (request, response, next) => {
    try {
      response.json({ message: await updateMailboxItem(request.meowUser.userId, request.params.itemId, request.body ?? {}) });
    } catch (error) {
      next(error);
    }
  });

  /** Permanently delete an item only after it has been moved into Trash. */
  router.delete('/messages/:itemId', async (request, response, next) => {
    try {
      await deleteTrashedItem(request.meowUser.userId, request.params.itemId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
