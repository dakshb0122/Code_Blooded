// Purpose: provide a private SMTP client that permits only internal @niti recipients.

import nodemailer from 'nodemailer';
import { config } from './config.js';

/** Configure the app's internal-only SMTP transport for the Compose Mailpit service. */
const smtpTransport = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: false,
});

/** Send mail only to an internal ईMAIL address; public-domain recipients are rejected. */
export async function sendInternalMail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const allowedSuffix = `@${config.emailDomain}`;
  if (recipients.length === 0 || recipients.some((recipient) => typeof recipient !== 'string' || !recipient.toLowerCase().endsWith(allowedSuffix))) {
    const error = new Error(`Email recipients must use the internal ${allowedSuffix} domain`);
    error.statusCode = 400;
    throw error;
  }

  return smtpTransport.sendMail({
    from: config.smtpFromAddress,
    to: recipients,
    subject,
    text,
    html,
  });
}
