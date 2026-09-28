// Purpose: validate the supported ten-digit Indian input and derive canonical identifiers.

import { config } from './config.js';

/** Validate a ten-digit mobile number and return its canonical +91 E.164 value. */
export function normalizeIndianPhone(phoneNumber) {
  if (typeof phoneNumber !== 'string' || !/^\d{10}$/.test(phoneNumber)) {
    const error = new Error('phoneNumber must contain exactly 10 digits');
    error.statusCode = 400;
    throw error;
  }
  return `${config.phoneCountryCode}${phoneNumber}`;
}

/** Convert a canonical phone number into ईMAIL's internal, non-public email identifier. */
export function phoneToEmailAddress(phoneNumber) {
  return `${phoneNumber.slice(config.phoneCountryCode.length)}@${config.emailDomain}`;
}
