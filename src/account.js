// Purpose: permanently remove an account and its private mailbox data.

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { EmailMessage, MailboxItem, PasswordReset, User, UserSession } from './models.js';

/** Delete one account only after the owner proves the password and confirms its address. */
export async function permanentlyDeleteAccount(userId, input = {}) {
  const user = await User.findById(userId).select('+passwordHash');
  const password = input.password;
  const confirmation = typeof input.confirmEmail === 'string' ? input.confirmEmail.trim().toLowerCase() : '';
  const passwordMatches = typeof password === 'string' && password.length <= 128 && user?.passwordHash
    ? await bcrypt.compare(password, user.passwordHash)
    : false;
  if (!user || !passwordMatches || confirmation !== user.emailAddress.toLowerCase()) {
    const error = new Error('Password or email confirmation did not match.');
    error.statusCode = 401;
    throw error;
  }

  const authoredMessages = await EmailMessage.find({ senderId: user._id }).select('_id').lean();
  const ownedItems = await MailboxItem.find({ userId: user._id }).select('messageId').lean();
  const authoredIds = authoredMessages.map(({ _id }) => _id);
  const affectedIds = [...new Map([...authoredIds, ...ownedItems.map(({ messageId }) => messageId)]
    .map((id) => [String(id), id])).values()];

  // Remove this user's mailbox copies and all copies of messages they authored.
  await MailboxItem.deleteMany({
    $or: [
      { userId: user._id },
      ...(authoredIds.length ? [{ messageId: { $in: authoredIds } }] : []),
    ],
  });

  // Remove message records only after no mailbox still refers to them, then purge their GridFS files.
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'mailAttachments' });
  const fileIds = new Map();
  for (const messageId of affectedIds) {
    if (await MailboxItem.exists({ messageId })) continue;
    const message = await EmailMessage.findByIdAndDelete(messageId).select('attachments.fileId').lean();
    for (const attachment of message?.attachments ?? []) {
      if (attachment.fileId && mongoose.isValidObjectId(attachment.fileId)) fileIds.set(String(attachment.fileId), attachment.fileId);
    }
  }
  await Promise.all([...fileIds.values()].map((fileId) => bucket.delete(fileId).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  })));

  await Promise.all([
    UserSession.deleteMany({ userId: user._id }),
    PasswordReset.deleteMany({ phoneNumber: user.phoneNumber }),
  ]);
  await User.deleteOne({ _id: user._id });
}
