// Purpose: implement ईMAIL's bilingual Telnyx DTMF menus and account actions.

import { config } from './config.js';
import { CallEvent, CallRecord, User } from './models.js';
import { phoneToEmailAddress } from './phone.js';
import { issuePasswordReset } from './password-reset.js';
import { callAction, sendSms } from './telnyx.js';

/** Choose a language-specific spoken voice and locale from persisted call state. */
function voiceOptions(language) {
  return language === 'hi'
    ? { language: config.telnyxHindiLanguage, voice: config.telnyxHindiVoice }
    : { language: config.telnyxEnglishLanguage, voice: config.telnyxEnglishVoice };
}

/** Return the prompt text for either the bilingual language choice or the main IVR menu. */
function menuPrompt(menuStage, language) {
  if (menuStage === 'language') {
    return 'For English, press 1. हिंदी में जारी रखने के लिए 2 दबाएँ।';
  }
  if (language === 'hi') {
    return 'नया खाता बनाने के लिए 1 दबाएँ। पासवर्ड रीसेट करने के लिए 2 दबाएँ। मुख्य मेनू दोहराने के लिए 9 दबाएँ।';
  }
  return 'To create an account, press 1. To reset your password, press 2. To repeat this menu, press 9.';
}

/** Start a one-digit gather prompt and persist its stage before issuing the provider command. */
async function gatherMenu(callRecord, menuStage, language = callRecord.language) {
  callRecord.menuStage = menuStage;
  callRecord.language = language;
  await callRecord.save();
  const options = menuStage === 'language'
    ? { language: config.telnyxLanguageMenuLanguage, voice: config.telnyxLanguageMenuVoice }
    : voiceOptions(language);
  await callAction(callRecord.providerCallControlId, 'gather_using_speak', {
    payload: menuPrompt(menuStage, language),
    ...options,
    service_level: 'premium',
    valid_digits: menuStage === 'language' ? '12' : '129',
    minimum_digits: 1,
    maximum_digits: 1,
    timeout_millis: 8_000,
    maximum_tries: 1,
    inter_digit_timeout_millis: 3_000,
  });
}

/** Speak a terminal message and hang up when the speech-finished webhook arrives. */
async function speakThenHangup(callRecord, message) {
  callRecord.menuStage = 'done';
  callRecord.selectedOption = callRecord.selectedOption ?? 'terminal';
  await callRecord.save();
  await callAction(callRecord.providerCallControlId, 'speak', {
    payload: message,
    ...voiceOptions(callRecord.language),
    service_level: 'premium',
  });
}

/** Release the number reservation once Telnyx has accepted a hangup command. */
async function hangupAndComplete(callRecord) {
  await callAction(callRecord.providerCallControlId, 'hangup');
  await CallRecord.updateOne(
    { _id: callRecord._id, status: { $nin: ['completed', 'failed'] } },
    { $set: { status: 'completed', completedAt: new Date(), failureReason: null }, $unset: { activePhoneNumber: 1 } },
  );
}

/** Send the account-created SMS with the account's complete @niti username. */
async function sendAccountCreatedSms(callRecord) {
  const username = phoneToEmailAddress(callRecord.phoneNumber);
  const message = callRecord.language === 'hi'
    ? 'आपका ईMAIL खाता बन गया है। आपका यूज़रनेम: ' + username + '.'
    : 'Your ईMAIL account has been created. Username: ' + username + '.';
  await sendSms(callRecord.phoneNumber, message);
  await User.updateOne(
    { phoneNumber: callRecord.phoneNumber, accountSmsPending: true },
    { $set: { accountSmsPending: false, accountSmsSentAt: new Date() } },
  );
}

/** Return the spoken account-created confirmation with the full account username. */
function accountCreatedPrompt(language, username) {
  return language === 'hi'
    ? 'आपका ईMAIL खाता बन गया है। आपका यूज़रनेम ' + username + '.'
    : 'Your ईMAIL account has been created. Your username is ' + username.replace('@', ' at ') + '.';
}

/** Decode the ईMAIL call ID carried by Telnyx's base64 client_state field. */
function decodeClientState(clientState) {
  if (!clientState) return null;
  try {
    const parsedState = JSON.parse(Buffer.from(clientState, 'base64').toString('utf8'));
    return typeof parsedState.callId === 'string' ? parsedState.callId : null;
  } catch {
    return null;
  }
}

/** Find the persistent call record from provider state, falling back to its call-control ID. */
async function findCallRecord(payload) {
  const clientCallId = decodeClientState(payload.client_state);
  if (clientCallId) return CallRecord.findById(clientCallId);
  return CallRecord.findOne({ providerCallControlId: payload.call_control_id });
}

/** Retain full voice call events and safe messaging metadata without persisting SMS body text. */
async function storeProviderEventDetails(event, kind, callRecord = null) {
  const payload = event.payload ?? {};
  const details = {
    kind,
    callControlId: payload.call_control_id ?? null,
    direction: payload.direction ?? null,
    digits: payload.digits ?? null,
    hangupCause: payload.hangup_cause ?? null,
    from: payload.from?.phone_number ?? payload.from ?? null,
    to: Array.isArray(payload.to) ? payload.to.map((entry) => entry.phone_number ?? entry) : (payload.to?.phone_number ?? payload.to ?? null),
    messageId: payload.id ?? null,
    messageStatus: payload.to?.[0]?.status ?? payload.status ?? null,
  };
  await CallEvent.updateOne(
    { providerEventId: event.id },
    { $setOnInsert: { callId: callRecord?._id ?? null, providerEventId: event.id, eventType: event.event_type, occurredAt: event.occurred_at ? new Date(event.occurred_at) : new Date(), details, providerPayload: kind === 'voice' ? event : undefined } },
    { upsert: true },
  );
}

/** Create a phone-only account if absent and queue an appropriate spoken confirmation. */
async function createAccountOrExplain(callRecord) {
  const existingUser = await User.findOne({ phoneNumber: callRecord.phoneNumber }).lean();
  if (existingUser) {
    if (existingUser.accountSmsPending) {
      await sendAccountCreatedSms(callRecord);
      callRecord.selectedOption = 'account_created';
      await callRecord.save();
      await speakThenHangup(callRecord, accountCreatedPrompt(callRecord.language, phoneToEmailAddress(callRecord.phoneNumber)));
      return;
    }
    callRecord.selectedOption = 'create_existing';
    await callRecord.save();
    await speakThenHangup(callRecord, callRecord.language === 'hi'
      ? 'इस फ़ोन नंबर से पहले से एक खाता जुड़ा है।'
      : 'You already have an account with this phone number.');
    return;
  }

  try {
    await User.create({
      phoneNumber: callRecord.phoneNumber,
      emailAddress: phoneToEmailAddress(callRecord.phoneNumber),
      accountSmsPending: true,
    });
    await sendAccountCreatedSms(callRecord);
    callRecord.selectedOption = 'account_created';
    await callRecord.save();
    await speakThenHangup(callRecord, accountCreatedPrompt(callRecord.language, phoneToEmailAddress(callRecord.phoneNumber)));
  } catch (error) {
    if (error.code !== 11000) throw error;
    callRecord.selectedOption = 'create_existing';
    await callRecord.save();
    await speakThenHangup(callRecord, callRecord.language === 'hi'
      ? 'इस फ़ोन नंबर से पहले से एक खाता जुड़ा है।'
      : 'You already have an account with this phone number.');
  }
}

/** Send a password reset OTP only to a registered user and speak the result in their language. */
async function startPasswordReset(callRecord) {
  const otpSent = await issuePasswordReset(callRecord.phoneNumber);
  callRecord.selectedOption = otpSent ? 'password_reset_sent' : 'password_reset_no_account';
  await callRecord.save();
  const message = otpSent
    ? (callRecord.language === 'hi' ? 'पासवर्ड रीसेट कोड SMS से भेज दिया गया है।' : 'A password reset code has been sent by SMS.')
    : (callRecord.language === 'hi' ? 'इस नंबर पर कोई खाता नहीं मिला।' : 'No account was found for this phone number.');
  await speakThenHangup(callRecord, message);
}

/** Process one verified Telnyx event and update the IVR state machine. */
export async function handleVoiceEvent(event) {
  const payload = event.payload ?? {};
  const eventType = event.event_type;
  const callRecord = await findCallRecord(payload);
  await storeProviderEventDetails(event, 'voice', callRecord);
  if (!callRecord) return;

  callRecord.lastEventAt = event.occurred_at ? new Date(event.occurred_at) : new Date();
  if (payload.call_control_id) callRecord.providerCallControlId = payload.call_control_id;

  if (eventType === 'call.initiated') {
    callRecord.status = 'initiated';
    await callRecord.save();
    return;
  }
  if (eventType === 'call.ringing') {
    callRecord.status = 'ringing';
    await callRecord.save();
    return;
  }
  if (eventType === 'call.answered') {
    callRecord.status = 'active';
    await callRecord.save();
    await gatherMenu(callRecord, 'language');
    return;
  }
  if (eventType === 'call.gather.ended') {
    await handleGatherResult(callRecord, String(payload.digits ?? ''));
    return;
  }
  if (eventType === 'call.speak.ended' && callRecord.menuStage === 'done') {
    await hangupAndComplete(callRecord);
    return;
  }
  if (eventType === 'call.hangup') {
    const completedNormally = payload.hangup_cause === 'normal_clearing';
    await CallRecord.updateOne(
      { _id: callRecord._id, status: { $nin: ['completed', 'failed'] } },
      {
        $set: {
          status: completedNormally ? 'completed' : 'failed',
          completedAt: new Date(),
          failureReason: completedNormally ? null : (payload.hangup_cause ?? 'call_hangup'),
        },
        $unset: { activePhoneNumber: 1 },
      },
    );
  }
}

/** Route a gathered DTMF digit according to the current language or main menu stage. */
async function handleGatherResult(callRecord, digit) {
  if (!digit) {
    callRecord.selectedOption = 'no_input';
    callRecord.menuStage = 'done';
    await callRecord.save();
    await hangupAndComplete(callRecord);
    return;
  }

  if (callRecord.menuStage === 'language') {
    if (digit === '1' || digit === '2') {
      callRecord.language = digit === '1' ? 'en' : 'hi';
      await gatherMenu(callRecord, 'main', callRecord.language);
      return;
    }
    await gatherMenu(callRecord, 'language');
    return;
  }

  callRecord.selectedOption = digit;
  await callRecord.save();
  if (digit === '1') return createAccountOrExplain(callRecord);
  if (digit === '2') return startPasswordReset(callRecord);
  if (digit === '9') return gatherMenu(callRecord, 'main');
  await gatherMenu(callRecord, 'main');
}

/** Persist one signed messaging provider event using only fields needed for delivery history. */
export async function storeProviderEvent(event, kind) {
  await storeProviderEventDetails(event, kind);
}
