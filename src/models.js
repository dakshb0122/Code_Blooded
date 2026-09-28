// Purpose: define persistent user, internal-mail, call, OTP, event, and webhook records.

import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Persist one ईMAIL account, uniquely identified by its canonical Indian phone number. */
const userSchema = new Schema({
  phoneNumber: { type: String, required: true, unique: true, index: true },
  emailAddress: { type: String, required: true, unique: true },
  passwordHash: { type: String, default: null },
  /** Keep the optional profile image in MongoDB so it follows the account between devices. */
  avatarData: { type: Buffer, default: null, select: false },
  avatarMimeType: { type: String, default: null, select: false },
  /** Keep failed account-created SMS sends retryable on a Telnyx event redelivery. */
  accountSmsPending: { type: Boolean, default: false },
  /** Record when Telnyx accepted the account-created SMS request. */
  accountSmsSentAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

/** Persist only hashed, expiring browser sessions and allow them to be revoked on logout. */
const userSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

/** Automatically remove expired session records after their authentication window ends. */
userSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Store one internal-only message addressed to existing ईMAIL users. */
const emailMessageSchema = new Schema({
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  senderAddress: { type: String, required: true },
  recipientIds: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  recipientAddresses: [{ type: String, required: true }],
  subject: { type: String, default: '', maxlength: 200 },
  body: { type: String, default: '', maxlength: 30_000 },
  attachments: [{
    _id: false,
    fileId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, maxlength: 180 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
  }],
  status: { type: String, enum: ['draft', 'sent'], required: true, index: true },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

/** Keep separate per-user folder, read, and star state for a shared internal message. */
const mailboxItemSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  messageId: { type: Schema.Types.ObjectId, ref: 'EmailMessage', required: true, index: true },
  folder: { type: String, enum: ['inbox', 'sent', 'draft', 'archive', 'trash'], required: true, index: true },
  isRead: { type: Boolean, default: false },
  isStarred: { type: Boolean, default: false },
}, { timestamps: true });

/** Allow a user to keep inbox and sent views for a message addressed to themselves. */
mailboxItemSchema.index({ userId: 1, messageId: 1, folder: 1 }, { unique: true });

/** Keep a call attempt forever, and reserve its phone while the call is active. */
const callRecordSchema = new Schema({
  phoneNumber: { type: String, required: true, index: true },
  activePhoneNumber: { type: String, default: undefined },
  status: {
    type: String,
    enum: ['queued', 'dispatching', 'dispatch_unknown', 'initiated', 'ringing', 'active', 'completed', 'failed'],
    default: 'queued',
    index: true,
  },
  providerCallControlId: { type: String, default: null, index: true },
  language: { type: String, enum: ['en', 'hi'], default: null },
  menuStage: { type: String, enum: ['language', 'main', 'done'], default: 'language' },
  selectedOption: { type: String, default: null },
  dispatchStartedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  failureReason: { type: String, default: null },
  lastEventAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

/** Enforce at most one active outbound call for each number without removing call history. */
callRecordSchema.index({ activePhoneNumber: 1 }, {
  unique: true,
  sparse: true,
  name: 'one_active_call_per_phone',
});

/** Store expiring, single-use password reset codes as hashes rather than clear text. */
const passwordResetSchema = new Schema({
  phoneNumber: { type: String, required: true, index: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: true },
  attempts: { type: Number, default: 0 },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

/** Store only the provider event fields needed for audit and IVR behavior. */
const callEventSchema = new Schema({
  callId: { type: Schema.Types.ObjectId, ref: 'CallRecord', default: null, index: true },
  providerEventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true, index: true },
  occurredAt: { type: Date, default: Date.now },
  details: { type: Schema.Types.Mixed, default: {} },
  providerPayload: { type: Schema.Types.Mixed, default: undefined },
}, { timestamps: { createdAt: true, updatedAt: false } });

/** Track callback processing so Telnyx's duplicate deliveries remain idempotent. */
const webhookReceiptSchema = new Schema({
  providerEventId: { type: String, required: true, unique: true },
  eventType: { type: String, required: true },
  state: { type: String, enum: ['received', 'processed'], default: 'received' },
  lastError: { type: String, default: null },
}, { timestamps: true });

/** Export the models used by the API and call-worker processes. */
export const User = model('User', userSchema);
export const UserSession = model('UserSession', userSessionSchema);
export const EmailMessage = model('EmailMessage', emailMessageSchema);
export const MailboxItem = model('MailboxItem', mailboxItemSchema);
export const CallRecord = model('CallRecord', callRecordSchema);
export const PasswordReset = model('PasswordReset', passwordResetSchema);
export const CallEvent = model('CallEvent', callEventSchema);
export const WebhookReceipt = model('WebhookReceipt', webhookReceiptSchema);
