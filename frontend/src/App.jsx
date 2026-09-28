// Purpose: provide ईMAIL's phone-based enrollment, password setup, and sign-in experience.

import { useEffect, useState } from 'react';
import Mailbox from './Mailbox.jsx';
import { requestApi } from './api.js';
import PasswordInput from './PasswordInput.jsx';
import './App.css';

/** Keep the supported Indian subscriber number length visible at the form boundary. */
const PHONE_DIGIT_COUNT = 10;
const LOGIN_BACKGROUND_SLIDES = [
  '/login-modern-ribbons.png',
  '/login-modern-glass.png',
  '/login-modern-orbits.png',
];
for (let index = LOGIN_BACKGROUND_SLIDES.length - 1; index > 0; index -= 1) {
  const randomIndex = Math.floor(Math.random() * (index + 1));
  [LOGIN_BACKGROUND_SLIDES[index], LOGIN_BACKGROUND_SLIDES[randomIndex]] = [
    LOGIN_BACKGROUND_SLIDES[randomIndex],
    LOGIN_BACKGROUND_SLIDES[index],
  ];
}
/** Poll only the public status view for the enrollment call shown to this browser. */
const CALL_STATUS_POLL_INTERVAL_MS = 2500;
const AUTH_COPY = {
  en: {
    language: 'Language',
    welcome: 'Welcome back',
    signInIntro: 'Sign in to continue to your ईMAIL mailbox.',
    join: 'JOIN ईMAIL',
    createAccount: 'Create your account',
    createIntro: 'We’ll call your phone and guide you through account creation.',
    security: 'ACCOUNT SECURITY',
    setPassword: 'Set your password',
    passwordIntro: 'We’ll text a one-time code to verify your phone number.',
    signIn: 'Sign in',
    mobile: 'Mobile number',
    phonePlaceholder: '10-digit mobile number',
    phoneHelp: 'Enter your 10-digit Indian mobile number.',
    password: 'Password',
    passwordPlaceholder: 'Your password',
    forgotPassword: 'Forgot or need to set a password?',
    otp: 'SMS verification code',
    otpPlaceholder: '6-digit code',
    newPassword: 'New password',
    newPasswordPlaceholder: 'At least 6 characters',
    otpHelp: 'The SMS code expires after a few minutes and can only be used once.',
    callStart: 'Call me to get started',
    wait: 'Please wait…',
    savePassword: 'Save password',
    sendCode: 'Send verification code',
    resend: 'Send another code',
    back: 'Back to sign in',
    privacy: 'Your number is used as your username and stays private.',
    callQueued: 'We are calling you now. Answer the call, choose a language, then press 1 to create your account.',
    passwordSaved: 'Password saved. You can now sign in with your phone number.',
    signedOut: 'You have signed out.',
    resetRequested: 'If an account exists for this number, a code has been sent by SMS.',
    setPasswordNotice: 'Request an SMS code to set your password.',
    resetPasswordNotice: 'Request an SMS code to set or reset your password.',
    setPasswordAction: 'Set password',
    resetPasswordAction: 'Set or reset password',
    callConnected: 'Call connected',
    call: 'Call',
  },
  hi: {
    language: 'भाषा',
    welcome: 'आपका स्वागत है',
    signInIntro: 'अपने ईमेल खाते में आगे बढ़ने के लिए साइन इन करें।',
    join: 'ईमेल से जुड़ें',
    createAccount: 'अपना खाता बनाएँ',
    createIntro: 'हम आपको कॉल करेंगे और खाता बनाने की प्रक्रिया बताएँगे।',
    security: 'खाता सुरक्षा',
    setPassword: 'अपना पासवर्ड सेट करें',
    passwordIntro: 'आपका फ़ोन नंबर सत्यापित करने के लिए SMS से एक बार इस्तेमाल होने वाला कोड भेजा जाएगा।',
    signIn: 'साइन इन',
    mobile: 'मोबाइल नंबर',
    phonePlaceholder: '10 अंकों का मोबाइल नंबर',
    phoneHelp: 'भारत का 10 अंकों का मोबाइल नंबर दर्ज करें।',
    password: 'पासवर्ड',
    passwordPlaceholder: 'अपना पासवर्ड दर्ज करें',
    forgotPassword: 'पासवर्ड भूल गए हैं या नया सेट करना है?',
    otp: 'SMS सत्यापन कोड',
    otpPlaceholder: '6 अंकों का कोड',
    newPassword: 'नया पासवर्ड',
    newPasswordPlaceholder: 'कम से कम 6 अक्षर',
    otpHelp: 'SMS कोड कुछ मिनटों में समाप्त हो जाता है और केवल एक बार इस्तेमाल किया जा सकता है।',
    callStart: 'शुरू करने के लिए मुझे कॉल करें',
    wait: 'कृपया प्रतीक्षा करें…',
    savePassword: 'पासवर्ड सेव करें',
    sendCode: 'सत्यापन कोड भेजें',
    resend: 'दूसरा कोड भेजें',
    back: 'साइन इन पर वापस जाएँ',
    privacy: 'आपका नंबर आपका यूज़रनेम होगा और निजी रहेगा।',
    callQueued: 'हम अभी आपको कॉल कर रहे हैं। कॉल उठाएँ, भाषा चुनें और खाता बनाने के लिए 1 दबाएँ।',
    passwordSaved: 'पासवर्ड सेव हो गया। अब आप अपने फ़ोन नंबर से साइन इन कर सकते हैं।',
    signedOut: 'आप साइन आउट हो गए हैं।',
    resetRequested: 'अगर इस नंबर से खाता जुड़ा है, तो SMS से कोड भेज दिया गया है।',
    setPasswordNotice: 'पासवर्ड सेट करने के लिए SMS कोड माँगें।',
    resetPasswordNotice: 'पासवर्ड सेट या रीसेट करने के लिए SMS कोड माँगें।',
    setPasswordAction: 'पासवर्ड सेट करें',
    resetPasswordAction: 'पासवर्ड सेट या रीसेट करें',
    callConnected: 'कॉल जुड़ गई',
    call: 'कॉल',
  },
};

const HINDI_ERRORS = {
  'That phone number and password do not match.': 'यह फ़ोन नंबर और पासवर्ड मेल नहीं खाते।',
  'A call to this number is already in progress.': 'इस नंबर पर पहले से कॉल जारी है।',
  'Too many attempts. Please wait 15 minutes, then try again.': 'बहुत बार कोशिश की गई। कृपया 15 मिनट बाद फिर कोशिश करें।',
  'The server could not complete that request. Please try again shortly.': 'सर्वर अभी अनुरोध पूरा नहीं कर पाया। कृपया थोड़ी देर बाद फिर कोशिश करें।',
};

/** Convert a local or pasted Indian number into the ten-digit form accepted by ईMAIL. */
function getLocalPhoneDigits(value) {
  const digits = value.replace(/\D/g, '');
  const localDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return localDigits.slice(0, PHONE_DIGIT_COUNT);
}

/** Explain the latest enrollment call state and the next action the user can take. */
function getCallStatusMessage(callStatus, language) {
  if (callStatus.selectedOption === 'account_created' && callStatus.username) {
    return language === 'hi'
      ? `आपका खाता तैयार है। आपका यूज़रनेम ${callStatus.username} है।`
      : `Your account is ready. Your username is ${callStatus.username}. Set a password to sign in.`;
  }
  if (language === 'hi') {
    if (callStatus.selectedOption === 'account_created') return 'आपका खाता तैयार है। इस फ़ोन नंबर से साइन इन करने के लिए पासवर्ड सेट करें।';
    if (callStatus.selectedOption === 'create_existing') return 'इस नंबर से पहले से खाता जुड़ा है। साइन इन करें या पासवर्ड सेट/रीसेट करें।';
    if (callStatus.status === 'failed') return 'कॉल पूरी नहीं हो सकी। कृपया थोड़ी देर बाद फिर कोशिश करें।';
    if (callStatus.status === 'completed') return 'कॉल समाप्त हो गई। खाता सेटअप पूरा नहीं हुआ हो, तो नई कॉल शुरू करें।';
    return 'कॉल उठाएँ, भाषा चुनें और मुख्य मेन्यू में खाता बनाने के लिए 1 दबाएँ।';
  }
  if (callStatus.selectedOption === 'account_created') {
    return 'Your account is ready. Set a password to sign in with this phone number.';
  }
  if (callStatus.selectedOption === 'create_existing') {
    return 'An account already exists for this number. Sign in or set/reset its password.';
  }
  if (callStatus.status === 'dispatch_unknown') {
    return 'The call provider did not confirm whether the call started. Wait before retrying to avoid receiving a duplicate call.';
  }
  if (callStatus.status === 'failed' && callStatus.failureReason === 'provider_rejected_call') {
    return 'The call provider rejected the request. Please ask the site administrator to check the Telnyx voice application and caller ID configuration.';
  }
  if (callStatus.status === 'failed') {
    return callStatus.failureReason === 'timeout'
      ? 'The call was not answered before it timed out. Check that the phone can receive calls, then try again.'
      : 'The call could not be completed. Please wait a moment and try again.';
  }
  if (callStatus.status === 'completed') {
    return 'The call has ended. If you did not finish setup, you can start another call.';
  }
  return 'Answer the call, choose a language, then press 1 in the main menu to create your account.';
}

/** Render account access screens and the authenticated internal mailbox. */
function LoginHandoff({ language }) {
  return (
    <main className="mail-handoff" role="status" aria-live="polite">
      <svg className="mail-handoff-trail" viewBox="0 0 1200 220" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-30 164 C 200 18, 360 210, 590 105 S 940 22, 1230 126" />
      </svg>
      <div className="mail-handoff-flight" aria-hidden="true">
        <svg viewBox="0 0 140 112">
          <path className="mail-letter-string" d="M54 48 C 49 57 47 62 48 68" />
          <g className="mail-letter">
            <rect x="24" y="62" width="48" height="34" rx="5" />
            <path d="m27 67 21 17 21-17" />
            <path className="mail-letter-seal" d="M60 69h7v7h-7z" />
          </g>
          <path className="mail-bird-tail" d="m39 43-19-9 12 17-14 8 23-3" />
          <path className="mail-bird-body" d="M38 43c7-16 22-24 39-21-7 5-11 11-12 18 13-4 28-1 39 8-13 8-29 9-43 3-8 9-21 12-34 8l-15 5 8-14c-5-4-8-10-8-16 8 3 16 5 26 9Z" />
          <path className="mail-bird-wing" d="M52 41C42 16 56 6 75 20c-6 5-10 13-10 23-5 2-9 3-13-2Z" />
          <path className="mail-bird-beak" d="m101 39 17 6-17 4" />
          <circle className="mail-bird-eye" cx="89" cy="31" r="2" />
        </svg>
      </div>
      <p className="mail-handoff-message">
        {language === 'hi' ? 'आपका मेलबॉक्स खुल रहा है' : 'Opening your mailbox'}
        <span className="mail-handoff-dots" aria-hidden="true"><i /><i /><i /></span>
      </p>
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState('loading');
  const [language, setLanguage] = useState(() => {
    try { return window.localStorage.getItem('meow-auth-language') === 'hi' ? 'hi' : 'en'; }
    catch { return 'en'; }
  });
  const [mode, setMode] = useState('login');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [callId, setCallId] = useState('');
  const [callStatus, setCallStatus] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const copy = AUTH_COPY[language];

  useEffect(() => {
    try { window.localStorage.setItem('meow-auth-language', language); }
    catch { /* Keep the selected language for this page even when storage is unavailable. */ }
  }, [language]);

  useEffect(() => {
    let isMounted = true;
    requestApi('/auth/session')
      .then(({ user }) => {
        if (!isMounted) return;
        setCurrentUser(user);
        setScreen('account');
      })
      .catch(() => {
        if (isMounted) setScreen('auth');
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (!callId) return undefined;
    let isMounted = true;
    let pollTimer;

    /** Refresh the enrollment call's state until it reaches a terminal outcome. */
    const refreshCallStatus = async () => {
      try {
        const result = await requestApi(`/onboarding/calls/${callId}`);
        if (!isMounted) return;
        setCallStatus(result);
        if (!['completed', 'failed', 'dispatch_unknown'].includes(result.status)) {
          pollTimer = window.setTimeout(refreshCallStatus, CALL_STATUS_POLL_INTERVAL_MS);
        } else if (result.selectedOption === 'account_created') {
          setNotice(language === 'hi'
            ? `आपका खाता तैयार है। आपका यूज़रनेम ${result.username} है। नीचे पासवर्ड सेट करें।`
            : `Your account is ready. Your username is ${result.username}. Set a password below.`);
        }
      } catch {
        if (isMounted) pollTimer = window.setTimeout(refreshCallStatus, CALL_STATUS_POLL_INTERVAL_MS);
      }
    };

    refreshCallStatus();
    return () => {
      isMounted = false;
      window.clearTimeout(pollTimer);
    };
  }, [callId, language]);

  /** Store a single user-visible error and clear outdated success messages. */
  function showError(message) {
    setError(language === 'hi' ? HINDI_ERRORS[message] ?? message : message);
    setNotice('');
  }

  /** Start the Telnyx IVR call that creates an account after the caller presses 1. */
  async function requestAccountCall(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setCallStatus(null);
    setCallId('');
    try {
      const result = await requestApi('/onboarding/calls', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      });
      setCallId(result.callId);
      setNotice(copy.callQueued);
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  /** Authenticate with phone and password; the API stores its session in an HTTP-only cookie. */
  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, password }),
      });
      setCurrentUser(result.user);
      setPassword('');
      setScreen('handoff');
      const handoffDuration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 350 : 2300;
      await new Promise((resolve) => window.setTimeout(resolve, handoffDuration));
      setScreen('account');
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  /** Request a password setup or reset code without exposing account existence in the response. */
  async function requestPasswordCode(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestApi('/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber }),
      });
      setResetCodeSent(true);
      setNotice(language === 'hi' ? copy.resetRequested : result.message);
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  /** Verify an SMS code and save the user's initial or replacement password. */
  async function savePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestApi('/passwords/reset', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, otp, newPassword }),
      });
      setMode('login');
      setResetCodeSent(false);
      setPassword('');
      setOtp('');
      setNewPassword('');
      setNotice(copy.passwordSaved);
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  /** End the browser session and return to the sign-in screen. */
  async function signOut() {
    setBusy(true);
    try {
      await requestApi('/auth/logout', { method: 'POST' });
      setCurrentUser(null);
      setScreen('auth');
      setMode('login');
      setNotice(language === 'hi' ? copy.signedOut : 'You have signed out.');
    } catch (requestError) {
      showError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  /** Return to sign-in after the authenticated account deletion endpoint clears its cookie. */
  function accountDeleted() {
    setCurrentUser(null);
    setScreen('auth');
    setMode('login');
    setPhoneNumber('');
    setPassword('');
    setError('');
    setNotice('Your account and mailbox were permanently deleted.');
  }

  if (screen === 'loading') {
    return <main className="loading-screen" aria-live="polite">Loading your ईMAIL account…</main>;
  }

  if (screen === 'handoff') {
    return <LoginHandoff language={language} />;
  }

  if (screen === 'account' && currentUser) {
    return <Mailbox user={currentUser} onSignOut={signOut} onAccountChanged={setCurrentUser} onAccountDeleted={accountDeleted} busy={busy} language={language} />;
  }

  return (
    <main className="auth-page">
      <div className="auth-layout">
      <section className="brand-panel" aria-label="About ईMAIL mail">
        <div className="brand-backgrounds" aria-hidden="true">
          {LOGIN_BACKGROUND_SLIDES.map((image, index) => (
            <div
              className="brand-background-slide"
              key={image}
              style={{ backgroundImage: `url("${image}")`, animationDelay: `-${(LOGIN_BACKGROUND_SLIDES.length - index - 1) * 8}s` }}
            />
          ))}
        </div>
        <div className="brand-security-badge"><span aria-hidden="true">◆</span> Encrypted Mail</div>
        <a className="auth-brand-logo" href="/" aria-label="ईMAIL mail home">
          <img src="/mailbox-logo.png" alt="&#x0908;MAIL logo" />
        </a>
        <p className="brand-message">Secure, fast &amp; modern email<br />service for everyone.</p>
        <div className="brand-footer"><span><i />Servers Online</span><span>V2.4 Pro</span></div>
      </section>

      <section className="form-panel">
        <div className="form-wrap">
          <div className="language-picker">
            <label htmlFor="auth-language">{copy.language}</label>
            <select id="auth-language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
          <div className="mobile-brand">
            <div className="brand-backgrounds" aria-hidden="true">
              {LOGIN_BACKGROUND_SLIDES.map((image, index) => (
                <div
                  className="brand-background-slide"
                  key={image}
                  style={{ backgroundImage: `url("${image}")`, animationDelay: `-${(LOGIN_BACKGROUND_SLIDES.length - index - 1) * 8}s` }}
                />
              ))}
            </div>
            <img src="/mailbox-logo.png" alt="&#x0908;MAIL logo" />
          </div>
          {mode !== 'login' && <p className="eyebrow">{mode === 'enroll' ? copy.join : copy.security}</p>}
          <h2>{mode === 'login' ? copy.welcome : mode === 'enroll' ? copy.createAccount : copy.setPassword}</h2>
          <p className="form-intro">{mode === 'login' ? copy.signInIntro : mode === 'enroll' ? copy.createIntro : copy.passwordIntro}</p>

          <div className="mode-tabs" role="tablist" aria-label={language === 'hi' ? 'खाता विकल्प' : 'Account actions'}>
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>{copy.signIn}</button>
            <button type="button" role="tab" aria-selected={mode === 'enroll'} className={mode === 'enroll' ? 'active' : ''} onClick={() => { setMode('enroll'); setError(''); }}>{copy.createAccount}</button>
          </div>

          <form className="auth-form" onSubmit={mode === 'login' ? signIn : mode === 'enroll' ? requestAccountCall : resetCodeSent ? savePassword : requestPasswordCode}>
            <label htmlFor="phone-number">{copy.mobile}</label>
            <div className="phone-field">
              <span className="country-prefix">+91</span>
              <input
                id="phone-number"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                placeholder={copy.phonePlaceholder}
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(getLocalPhoneDigits(event.target.value));
                  setError('');
                  setNotice('');
                }}
                pattern="[0-9]{10}"
                maxLength={10}
                required
              />
            </div>

            {mode === 'login' && (
              <>
                <label htmlFor="password">{copy.password}</label>
                <PasswordInput id="password" autoComplete="current-password" placeholder={copy.passwordPlaceholder} value={password} onChange={(event) => setPassword(event.target.value)} required visible={showPassword} onToggle={() => setShowPassword((visible) => !visible)} />
                <button className="text-link forgot-link" type="button" onClick={() => { setMode('password'); setResetCodeSent(false); setError(''); setNotice(''); }}>{copy.forgotPassword}</button>
              </>
            )}

            {mode === 'password' && resetCodeSent && (
              <>
                <label htmlFor="otp">{copy.otp}</label>
                <input id="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder={copy.otpPlaceholder} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required />
                <label htmlFor="new-password">{copy.newPassword}</label>
                <PasswordInput id="new-password" autoComplete="new-password" minLength={6} maxLength={128} placeholder={copy.newPasswordPlaceholder} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required visible={showNewPassword} onToggle={() => setShowNewPassword((visible) => !visible)} />
                <small className="field-help">{copy.otpHelp}</small>
              </>
            )}

            {error && <p className="feedback feedback-error" role="alert">{error}</p>}
            {notice && <p className="feedback feedback-notice" role="status">{notice}</p>}
            {callStatus && (
              <div className="call-status" role="status">
                <span className="status-dot" />
                <div>
                  <strong>{callStatus.status === 'active' ? copy.callConnected : `${copy.call} ${callStatus.status}`}</strong>
                  <p>{getCallStatusMessage(callStatus, language)}</p>
                  {callStatus.selectedOption === 'account_created' && (
                    <button className="text-link call-next-action" type="button" onClick={() => { setMode('password'); setResetCodeSent(false); setNotice(copy.setPasswordNotice); }}>
                      {copy.setPasswordAction}
                    </button>
                  )}
                  {callStatus.selectedOption === 'create_existing' && (
                    <button className="text-link call-next-action" type="button" onClick={() => { setMode('password'); setResetCodeSent(false); setNotice(copy.resetPasswordNotice); }}>
                      {copy.resetPasswordAction}
                    </button>
                  )}
                </div>
              </div>
            )}

            <button className="button button-primary submit-button" type="submit" disabled={busy || (mode !== 'password' && phoneNumber.length !== PHONE_DIGIT_COUNT)}>
              {busy ? copy.wait : mode === 'login' ? copy.signIn : mode === 'enroll' ? copy.callStart : resetCodeSent ? copy.savePassword : copy.sendCode}
            </button>
          </form>

          {mode === 'password' && resetCodeSent && <button className="text-link resend-link" type="button" disabled={busy} onClick={requestPasswordCode}>{copy.resend}</button>}
          {mode === 'password' && <button className="text-link back-link" type="button" onClick={() => { setMode('login'); setResetCodeSent(false); setError(''); setNotice(''); }}>{copy.back}</button>}
          <p className="privacy-note"><span aria-hidden="true">⌑</span> {copy.privacy}</p>
        </div>
      </section>
      </div>
    </main>
  );
}
