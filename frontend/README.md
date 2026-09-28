<!-- Purpose: explain the ईMAIL frontend's local development and container setup. -->

# ईMAIL frontend

This React/Vite application provides account enrollment, phone/password sign-in, SMS OTP password setup, and the authenticated ईMAIL internal email interface. Mail uses the same-origin `/api/v1/mail` API and only existing `@niti` ईMAIL accounts can receive messages.

Run `npm ci` and `npm run dev` from this directory for local frontend work. The Vite development server proxies `/api` requests to `http://localhost:3000` by default. Set `MEOW_API_PROXY_TARGET` to change that backend origin.

The production image builds the static frontend and serves it inside the private `frontend` Compose container. The API container proxies page and asset requests to it, leaving the existing API host port as the only Funnel entry point.
