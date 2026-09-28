// Purpose: provide shared same-origin API requests for the ईMAIL browser UI.

/** Call the same-origin API and turn structured error responses into readable messages. */
export async function requestApi(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body instanceof Blob) {
    headers.set('Content-Type', options.body.type || 'application/octet-stream');
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  const responseText = response.status === 204 ? '' : await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText };
    }
  }
  if (!response.ok) {
    const message = response.status === 429
      ? 'Too many attempts. Please wait 15 minutes, then try again.'
      : result?.error === 'invalid_credentials'
      ? 'That phone number and password do not match.'
      : result?.error === 'active_call_exists'
        ? 'A call to this number is already in progress.'
        : result?.error === 'internal_server_error'
          ? 'The server could not complete that request. Please try again shortly.'
          : result?.error || 'ईMAIL could not complete that request. Please try again.';
    throw new Error(message);
  }
  return result;
}
