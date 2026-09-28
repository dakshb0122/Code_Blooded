// Purpose: create and verify single-use SMS password-reset codes without storing OTP text.

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { PasswordReset, User } from './models.js';
import { sendSms } from './telnyx.js';

/** Hash an OTP together with its destination so a database leak does not reveal the code. */
function hashOtp(phoneNumber, otp) {
  return createHmac('sha256', config.otpHashSecret).update(`${phoneNumber}:${otp}`).digest('hex');
}

/** Compare OTP hashes without leaking a prefix match through response timing. */
function hashesMatch(actualHash, expectedHash) {
  const actualBytes = Buffer.from(actualHash, 'hex');
  const expectedBytes = Buffer.from(expectedHash, 'hex');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** Issue one numeric OTP to an existing user's phone and persist only its protected hash. */
export async function issuePasswordReset(phoneNumber) {
  const user = await User.findOne({ phoneNumber }).lean();
  if (!user) return false;

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiresAt = new Date(Date.now() + config.otpTtlMinutes * 60_000);
  await PasswordReset.updateMany({ phoneNumber, consumedAt: null }, { $set: { consumedAt: new Date() } });
  const resetRecord = await PasswordReset.create({ phoneNumber, otpHash: hashOtp(phoneNumber, otp), expiresAt });

  try {
    await sendSms(phoneNumber, `Your ईMAIL password reset code is ${otp}. It expires in ${config.otpTtlMinutes} minutes.`);
    return true;
  } catch (error) {
    await PasswordReset.updateOne({ _id: resetRecord._id }, { $set: { consumedAt: new Date() } });
    throw error;
  }
}

/** Check a submitted reset code, enforce attempt limits, and replace the account password. */
export async function resetPassword({ phoneNumber, otp, newPassword }) {
  const resetRecord = await PasswordReset.findOne({
    phoneNumber,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
    attempts: { $lt: config.otpMaxAttempts },
  }).sort({ createdAt: -1 });
  if (!resetRecord) {
    const error = new Error('No valid password reset code was found');
    error.statusCode = 400;
    throw error;
  }

  resetRecord.attempts += 1;
  await resetRecord.save();
  if (!hashesMatch(resetRecord.otpHash, hashOtp(phoneNumber, otp))) {
    const error = new Error('The password reset code is invalid');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const consumeResult = await PasswordReset.updateOne(
    { _id: resetRecord._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  if (consumeResult.modifiedCount !== 1) {
    const error = new Error('The password reset code has already been used');
    error.statusCode = 409;
    throw error;
  }
  await User.updateOne({ phoneNumber }, { $set: { passwordHash } });
}
