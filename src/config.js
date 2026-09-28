// Purpose: read and validate environment-backed configuration shared by ईMAIL services.

/** Read a required string configuration value and reject missing placeholders. */
function required(name) {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('<')) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Convert an optional numeric environment value to a positive integer. */
function positiveInteger(name, fallback) {
  const parsedValue = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsedValue;
}

/** Define the validated configuration values consumed by API and worker containers. */
export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: positiveInteger('PORT', 3000),
  mongodbUri: required('MONGODB_URI'),
  publicBaseUrl: required('PUBLIC_BASE_URL').replace(/\/$/, ''),
  callsApiToken: required('CALLS_API_TOKEN'),
  sessionTtlDays: positiveInteger('SESSION_TTL_DAYS', 7),
  phoneCountryCode: process.env.PHONE_COUNTRY_CODE ?? '+91',
  emailDomain: process.env.EMAIL_DOMAIN ?? 'niti',
  telnyxApiKey: required('TELNYX_API_KEY'),
  telnyxVoiceAppId: required('TELNYX_VOICE_APP_ID'),
  telnyxCallerId: required('TELNYX_CALLER_ID'),
  telnyxSmsFromNumber: process.env.TELNYX_SMS_FROM_NUMBER ?? process.env.TELNYX_CALLER_ID,
  telnyxMessagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID ?? '',
  telnyxWebhookPublicKey: process.env.TELNYX_WEBHOOK_PUBLIC_KEY ?? '',
  telnyxEnglishLanguage: process.env.TELNYX_ENGLISH_LANGUAGE ?? 'en-US',
  telnyxHindiLanguage: process.env.TELNYX_HINDI_LANGUAGE ?? 'hi-IN',
  telnyxEnglishVoice: process.env.TELNYX_ENGLISH_VOICE ?? 'female',
  telnyxHindiVoice: process.env.TELNYX_HINDI_VOICE ?? 'female',
  telnyxLanguageMenuLanguage: process.env.TELNYX_LANGUAGE_MENU_LANGUAGE ?? 'en-US',
  telnyxLanguageMenuVoice: process.env.TELNYX_LANGUAGE_MENU_VOICE ?? 'Azure.en-US-AvaMultilingualNeural',
  otpHashSecret: required('OTP_HASH_SECRET'),
  otpTtlMinutes: positiveInteger('OTP_TTL_MINUTES', 5),
  otpMaxAttempts: positiveInteger('OTP_MAX_ATTEMPTS', 5),
  smtpHost: process.env.SMTP_HOST ?? 'smtp',
  smtpPort: positiveInteger('SMTP_PORT', 1025),
  smtpFromAddress: process.env.SMTP_FROM_ADDRESS ?? 'no-reply@niti',
  /** Keep OpenRouter optional so normal mailbox access works without AI credentials. */
  openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim().startsWith('<')
    ? ''
    : process.env.OPENROUTER_API_KEY?.trim() ?? '',
  openRouterModel: process.env.OPENROUTER_MODEL?.trim() || 'openrouter/free',
});
