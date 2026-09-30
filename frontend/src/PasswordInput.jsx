// Purpose: provide a password input with an accessible show/hide control.

/** Render a password field and a keyboard-accessible visibility toggle. */
export default function PasswordInput({ id, visible, onToggle, className = '', language = 'en', ...inputProps }) {
  const visibilityLabel = language === 'hi'
    ? visible ? 'पासवर्ड छिपाएँ' : 'पासवर्ड दिखाएँ'
    : visible ? 'Hide password' : 'Show password';
  return (
    <div className={`password-input-wrap ${className}`.trim()}>
      <input {...inputProps} id={id} type={visible ? 'text' : 'password'} />
      <button
        className="password-visibility-toggle"
        type="button"
        aria-label={visibilityLabel}
        aria-pressed={visible}
        title={visibilityLabel}
        onClick={onToggle}
        disabled={inputProps.disabled}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M2.2 12s3.5-6 9.8-6 9.8 6 9.8 6-3.5 6-9.8 6-9.8-6-9.8-6Z" />
          <circle cx="12" cy="12" r="3" />
          {!visible && <path d="m4 4 16 16" />}
        </svg>
      </button>
    </div>
  );
}
