// Purpose: manage private, MongoDB-backed email between existing ईMAIL users.

import mongoose from 'mongoose';
import { config } from './config.js';
import { EmailMessage, MailboxItem, User } from './models.js';

/** Limit mailbox folders to the states exposed in ईMAIL's internal mail UI. */
const FOLDERS = new Set(['inbox', 'sent', 'draft', 'archive', 'trash']);
/** Bound recipient expansion so one send cannot create an unbounded number of copies. */
const MAX_RECIPIENTS = 10;
/** Keep attachment data in GridFS instead of exceeding MongoDB's message-document limit. */
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Create a structured API error with the intended HTTP response status. */
function mailboxError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** Normalize and validate a list of internal recipient addresses. */
function normalizeAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > MAX_RECIPIENTS) {
    throw mailboxError(400, `Provide between 1 and ${MAX_RECIPIENTS} recipients.`);
  }
  const domain = config.emailDomain.toLowerCase();
  const normalized = [...new Set(addresses.map((address) => String(address).trim().toLowerCase()))];
  if (normalized.some((address) => !/^[^\s@,]+@[^\s@,]+$/.test(address) || !address.endsWith(`@${domain}`))) {
    throw mailboxError(400, `Email is limited to existing @${domain} accounts.`);
  }
  return normalized;
}

/** Validate message text and enforce the documented subject and body limits. */
function normalizeMessageContent(input) {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  if (!subject || subject.length > 200) throw mailboxError(400, 'Subject must contain 1 to 200 characters.');
  if (!body.trim() || body.length > 30_000) throw mailboxError(400, 'Message must contain 1 to 30000 characters.');
  return { subject, body };
}

/** Keep draft fields within storage limits while allowing incomplete composition. */
function normalizeDraftContent(input) {
  const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
  const body = typeof input.body === 'string' ? input.body : '';
  if (subject.length > 200) throw mailboxError(400, 'Subject must not exceed 200 characters.');
  if (body.length > 30_000) throw mailboxError(400, 'Message must not exceed 30000 characters.');
  return { subject, body };
}

/** Get the GridFS bucket that stores uploaded mailbox attachments. */
function getMailAttachmentBucket() {
  if (!mongoose.connection.db) throw mailboxError(503, 'Mailbox storage is not ready.');
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'mailAttachments' });
}

/** Validate references to uploads owned by the sender and keep only their metadata in message documents. */
async function normalizeAttachments(userId, value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) {
    throw mailboxError(400, `Attach up to ${MAX_ATTACHMENT_COUNT} files per message.`);
  }
  const ids = value.map((attachment) => attachment?.id);
  if (ids.some((id) => typeof id !== 'string' || !mongoose.isValidObjectId(id)) || new Set(ids).size !== ids.length) {
    throw mailboxError(400, 'One of the attachments is invalid.');
  }
  if (!ids.length) return [];
  const ownerId = String(userId);
  const files = await getMailAttachmentBucket().find({
    _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    'metadata.ownerId': ownerId,
  }).toArray();
  if (files.length !== ids.length) throw mailboxError(400, 'An attachment could not be found. Please attach it again.');
  const filesById = new Map(files.map((file) => [String(file._id), file]));
  return ids.map((id) => {
    const file = filesById.get(id);
    if (!file || file.length === 0 || file.length > MAX_ATTACHMENT_BYTES) throw mailboxError(413, 'Each attachment must be 15 MB or less.');
    return { fileId: file._id, name: file.filename, mimeType: file.metadata.mimeType, size: file.length };
  });
}

/** Store one file in GridFS so a 15 MB upload stays outside the BSON message-size limit. */
export async function uploadMailboxAttachment(userId, filename, mimeType, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) throw mailboxError(400, 'Choose a non-empty file.');
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw mailboxError(413, 'Each attachment must be 15 MB or less.');
  const safeName = String(filename ?? '').trim().replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180);
  const safeMimeType = typeof mimeType === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(mimeType)
    ? mimeType.toLowerCase()
    : 'application/octet-stream';
  if (!safeName) throw mailboxError(400, 'A filename is required.');
  const upload = getMailAttachmentBucket().openUploadStream(safeName, {
    metadata: { ownerId: String(userId), mimeType: safeMimeType },
  });
  await new Promise((resolve, reject) => {
    upload.once('finish', resolve);
    upload.once('error', reject);
    upload.end(bytes);
  });
  return { id: String(upload.id), name: safeName, mimeType: safeMimeType, size: bytes.length };
}

/** Return a file stream only if the caller owns a mailbox copy of its message. */
export async function getMailboxAttachment(userId, attachmentId) {
  if (!mongoose.isValidObjectId(attachmentId)) throw mailboxError(400, 'Invalid attachment identifier.');
  const fileId = new mongoose.Types.ObjectId(attachmentId);
  const message = await EmailMessage.findOne({ 'attachments.fileId': fileId }).select('_id attachments').lean();
  if (!message || !await MailboxItem.exists({ userId, messageId: message._id })) throw mailboxError(404, 'Attachment not found.');
  const attachment = message.attachments.find((item) => String(item.fileId) === String(fileId));
  const file = await getMailAttachmentBucket().find({ _id: fileId }).next();
  if (!attachment || !file) throw mailboxError(404, 'Attachment not found.');
  return { attachment, file, stream: getMailAttachmentBucket().openDownloadStream(fileId) };
}

/** Delete an upload owned by the caller only while no message references it. */
export async function deleteMailboxAttachment(userId, attachmentId) {
  if (!mongoose.isValidObjectId(attachmentId)) throw mailboxError(400, 'Invalid attachment identifier.');
  const fileId = new mongoose.Types.ObjectId(attachmentId);
  const file = await getMailAttachmentBucket().find({ _id: fileId, 'metadata.ownerId': String(userId) }).next();
  if (!file) throw mailboxError(404, 'Attachment not found.');
  if (await EmailMessage.exists({ 'attachments.fileId': fileId })) throw mailboxError(409, 'This attachment is saved with a message.');
  await getMailAttachmentBucket().delete(fileId);
}

/** Remove former draft uploads once the updated draft no longer references them. */
async function deleteUnreferencedAttachments(fileIds) {
  const bucket = getMailAttachmentBucket();
  for (const fileId of fileIds) {
    if (!await EmailMessage.exists({ 'attachments.fileId': fileId })) {
      await bucket.delete(fileId).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
  }
}

/** Allow an incomplete draft to have no recipients while validating any entered addresses. */
function normalizeDraftRecipients(value) {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) return [];
  return normalizeAddresses(value);
}

/** Resolve only existing ईMAIL accounts and reject unknown internal addresses. */
async function resolveRecipients(addresses) {
  const normalized = normalizeAddresses(addresses);
  const recipients = await User.find({ emailAddress: { $in: normalized } }).select('_id emailAddress').lean();
  if (recipients.length !== normalized.length) {
    const found = new Set(recipients.map((recipient) => recipient.emailAddress));
    throw mailboxError(404, `No ईMAIL account exists for: ${normalized.filter((address) => !found.has(address)).join(', ')}`);
  }
  return recipients;
}

/** Convert a mailbox item and its message into a safe browser response. */
function serializeItem(item, includeBody = true) {
  const message = item.messageId;
  return {
    id: String(item._id),
    folder: item.folder,
    isRead: item.isRead,
    isStarred: item.isStarred,
    sender: message.senderAddress,
    recipients: message.recipientAddresses,
    subject: message.subject,
    ...(includeBody ? { body: message.body } : {}),
    attachments: (message.attachments ?? []).map(({ fileId, name, mimeType, size }) => ({
      id: String(fileId), name, mimeType, size,
    })),
    preview: message.body.slice(0, 150),
    sentAt: message.sentAt,
    createdAt: message.createdAt,
    updatedAt: item.updatedAt,
  };
}

/** Return one user's messages in a folder with optional subject/body search. */
export async function listMailbox(userId, folder, search = '') {
  if (!FOLDERS.has(folder) && folder !== 'starred' && folder !== 'unread') throw mailboxError(400, 'Unknown mailbox folder.');
  const filter = folder === 'starred'
    ? { userId, isStarred: true }
    : folder === 'unread'
      ? { userId, folder: { $in: ['inbox', 'archive'] }, isRead: false }
      : { userId, folder };
  const itemQuery = MailboxItem.find(filter).sort({ updatedAt: -1 }).limit(100).populate({
    path: 'messageId',
    select: 'senderAddress recipientAddresses subject body sentAt createdAt updatedAt attachments.name attachments.mimeType attachments.size',
  });
  const items = await itemQuery.lean();
  const term = search.trim().slice(0, 100);
  if (!term) return items.filter((item) => item.messageId).map((item) => serializeItem(item, false));
  const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(safeTerm, 'i');
  return items.filter((item) => item.messageId && (matcher.test(item.messageId.subject) || matcher.test(item.messageId.body)
    || matcher.test(item.messageId.senderAddress) || item.messageId.recipientAddresses.some((address) => matcher.test(address))))
    .map((item) => serializeItem(item, false));
}

/** Return a specific message only when the caller owns its mailbox item. */
export async function getMailboxItem(userId, itemId) {
  if (!mongoose.isValidObjectId(itemId)) throw mailboxError(400, 'Invalid message identifier.');
  const item = await MailboxItem.findOne({ _id: itemId, userId }).populate('messageId').lean();
  if (!item?.messageId) throw mailboxError(404, 'Message not found.');
  return serializeItem(item);
}

/** Persist a new unsent draft in the caller's Drafts folder. */
export async function createDraft(userId, input) {
  const recipientAddresses = normalizeDraftRecipients(input.to);
  const { subject, body } = normalizeDraftContent(input);
  const attachments = await normalizeAttachments(userId, input.attachments);
  const sender = await User.findById(userId).select('emailAddress').lean();
  if (!sender) throw mailboxError(401, 'Your ईMAIL session is no longer valid.');
  const message = await EmailMessage.create({
    senderId: userId,
    senderAddress: sender.emailAddress,
    recipientIds: [],
    recipientAddresses,
    subject,
    body,
    attachments,
    status: 'draft',
  });
  const item = await MailboxItem.create({ userId, messageId: message._id, folder: 'draft' });
  return getMailboxItem(userId, item._id);
}

/** Save changes to a draft that belongs to the signed-in user. */
export async function updateDraft(userId, itemId, input) {
  if (!mongoose.isValidObjectId(itemId)) throw mailboxError(400, 'Invalid draft identifier.');
  const item = await MailboxItem.findOne({ _id: itemId, userId, folder: 'draft' });
  if (!item) throw mailboxError(404, 'Draft not found.');
  const recipientAddresses = normalizeDraftRecipients(input.to);
  const { subject, body } = normalizeDraftContent(input);
  const attachments = await normalizeAttachments(userId, input.attachments);
  const previousDraft = await EmailMessage.findOne({ _id: item.messageId, senderId: userId, status: 'draft' }).select('attachments.fileId').lean();
  await EmailMessage.updateOne({ _id: item.messageId, senderId: userId, status: 'draft' }, {
    $set: { recipientAddresses, subject, body, attachments },
  });
  await deleteUnreferencedAttachments((previousDraft?.attachments ?? []).map((attachment) => attachment.fileId)
    .filter((fileId) => !attachments.some((attachment) => String(attachment.fileId) === String(fileId))));
  return getMailboxItem(userId, itemId);
}

/** Deliver a message to existing ईMAIL inboxes and retain a sender Sent copy. */
export async function sendMessage(userId, input, draftItemId = null) {
  const recipients = await resolveRecipients(input.to);
  const { subject, body } = normalizeMessageContent(input);
  const attachments = await normalizeAttachments(userId, input.attachments);
  const sender = await User.findById(userId).select('emailAddress').lean();
  if (!sender) throw mailboxError(401, 'Your ईMAIL session is no longer valid.');
  let message;
  let draftItem = null;
  if (draftItemId) {
    if (!mongoose.isValidObjectId(draftItemId)) throw mailboxError(400, 'Invalid draft identifier.');
    draftItem = await MailboxItem.findOne({ _id: draftItemId, userId, folder: 'draft' });
    if (!draftItem) throw mailboxError(404, 'Draft not found.');
    message = await EmailMessage.findOneAndUpdate({ _id: draftItem.messageId, senderId: userId, status: 'draft' }, {
      $set: {
        recipientIds: recipients.map((recipient) => recipient._id),
        recipientAddresses: recipients.map((recipient) => recipient.emailAddress),
        subject,
        body,
        attachments,
        status: 'sent',
        sentAt: new Date(),
      },
    }, { new: true });
  } else {
    message = await EmailMessage.create({
      senderId: userId,
      senderAddress: sender.emailAddress,
      recipientIds: recipients.map((recipient) => recipient._id),
      recipientAddresses: recipients.map((recipient) => recipient.emailAddress),
      subject,
      body,
      attachments,
      status: 'sent',
      sentAt: new Date(),
    });
  }
  if (!message) throw mailboxError(409, 'Draft could not be sent.');
  if (draftItem) await MailboxItem.deleteOne({ _id: draftItem._id });
  await MailboxItem.create([
    { userId, messageId: message._id, folder: 'sent', isRead: true },
    ...recipients.map((recipient) => ({ userId: recipient._id, messageId: message._id, folder: 'inbox' })),
  ]);
  return { id: String(message._id), sentAt: message.sentAt };
}

/** Update safe per-user read, star, or folder state for a mailbox item. */
export async function updateMailboxItem(userId, itemId, changes) {
  if (!mongoose.isValidObjectId(itemId)) throw mailboxError(400, 'Invalid message identifier.');
  const update = {};
  if (typeof changes.isRead === 'boolean') update.isRead = changes.isRead;
  if (typeof changes.isStarred === 'boolean') update.isStarred = changes.isStarred;
  if (changes.folder !== undefined) {
    if (!['archive', 'trash', 'inbox'].includes(changes.folder)) throw mailboxError(400, 'That folder action is not allowed.');
    update.folder = changes.folder;
  }
  if (!Object.keys(update).length) throw mailboxError(400, 'No supported mailbox changes were provided.');
  const item = await MailboxItem.findOneAndUpdate({ _id: itemId, userId }, { $set: update }, { new: true }).populate('messageId').lean();
  if (!item?.messageId) throw mailboxError(404, 'Message not found.');
  return serializeItem(item);
}

/** Permanently remove a message from the user's Trash, deleting its content when unreferenced. */
export async function deleteTrashedItem(userId, itemId) {
  if (!mongoose.isValidObjectId(itemId)) throw mailboxError(400, 'Invalid message identifier.');
  const item = await MailboxItem.findOneAndDelete({ _id: itemId, userId, folder: 'trash' });
  if (!item) throw mailboxError(404, 'Trashed message not found.');
  const remainingCopies = await MailboxItem.exists({ messageId: item.messageId });
  if (!remainingCopies) {
    const message = await EmailMessage.findByIdAndDelete(item.messageId).select('attachments.fileId').lean();
    if (message?.attachments?.length) {
      const bucket = getMailAttachmentBucket();
      await Promise.all(message.attachments.map(({ fileId }) => bucket.delete(fileId).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      })));
    }
  }
}
