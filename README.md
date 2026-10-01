<!-- Purpose: explain how to configure, start, and use the ईMAIL frontend and backend locally. -->

# ईMAIL application

ईMAIL provides phone-based account enrollment, password setup, sign-in, and a private internal email interface. A user enters an Indian mobile number, answers an outbound Telnyx call, and presses 1 in the IVR to create an account. Telnyx then sends an account confirmation SMS containing the user's phone number as their username. Signed-in users can exchange messages with existing ईMAIL users at their `@niti` account address.

Youtube video link : https://youtu.be/7gDpSVvA5IA?si=KxTZpAczuU40vGnA

## Containers

`docker compose up -d --build` starts five separate containers:

- `api`: REST API, browser authentication, Telnyx callbacks, and reverse proxy on host loopback port 3000 and the configured host LAN address.
- `frontend`: React/Vite build served by an unprivileged Nginx process on the private Compose network.
- `call-worker`: durable, no-retry Telnyx outbound call dispatcher.
- `mongodb`: persistent accounts, sessions, call records, and internal mailbox messages; not published to the host.
- `smtp`: Mailpit SMTP sink on the private Compose network; it cannot deliver mail to or receive mail from the public internet.

Tailscale Funnel forwards HTTPS to the API on `127.0.0.1:3000`. The API also listens on `HOST_LAN_IP:3000` for devices on the same local network. Set `HOST_LAN_IP` in `.env` to this computer's Wi-Fi IPv4 address; the current LAN URL is `http://192.168.1.55:3000` (update it if DHCP changes the Wi-Fi IP). The API proxies the UI and same-origin browser requests to the frontend. MongoDB and SMTP remain private.

## Setup

1. Keep `.env` local. It is ignored by Git; do not commit or share it. Rotate any provider key disclosed outside the local secret file before using the integration in production.
2. Confirm the Telnyx voice and messaging webhooks point to the callback URLs below and that `TELNYX_WEBHOOK_PUBLIC_KEY` matches the signing key.
3. Confirm `TELNYX_SMS_FROM_NUMBER` is a messaging-enabled Telnyx number. `TELNYX_MESSAGING_PROFILE_ID` can be left empty when Telnyx accepts the configured sender number directly.
4. Start all services with `docker compose up -d --build` and check `docker compose ps`.

Callback URLs:

- Voice: `https://laptop-oqc6pebh.tail323e79.ts.net/webhooks/telnyx/voice`
- Messaging: `https://laptop-oqc6pebh.tail323e79.ts.net/webhooks/telnyx/messaging`

On this local network, open `http://192.168.1.55:3000`. The public Funnel URL remains enabled for web access and Telnyx callbacks; the machine must stay online with Tailscale Funnel active.

## User flow

1. **Create an account:** enter a ten-digit Indian number and choose “Call me to get started.” Answer the call, choose a language, and press 1 in the main menu. ईMAIL stores the account and sends an SMS with the canonical `+91` phone number as the username.
2. **Set a password:** choose “Forgot or need to set a password?”, request an SMS code, and submit that code with a password of at least 6 characters. The same flow handles password recovery.
3. **Sign in:** enter the ten-digit phone number and password. The API sets an HTTP-only session cookie; the browser never receives `CALLS_API_TOKEN`.

## Internal email

The signed-in mailbox has Inbox, Starred, Sent, Drafts, Archive, and Trash views. Compose, reply, search, starring, archiving, and deletion are handled by the authenticated API and stored in MongoDB. The API accepts only existing ईMAIL `@niti` recipients, so mail cannot be addressed to outside systems. There is no SMTP inbound delivery or public mail routing. Mailpit remains a private SMTP sink for future local SMTP integration and is not used as the mailbox store.

## Profile pictures and AI tools

Users can change their profile picture from the account avatar in the sidebar. The browser crops and compresses it before the authenticated API stores it with the account.

The signed-in mailbox includes AI-assisted email drafting and suggested replies. Configure `OPENROUTER_API_KEY` in the local `.env` file; `OPENROUTER_MODEL` defaults to `openrouter/free`. Create a key from OpenRouter and keep it in `.env`, never in frontend code. The free router uses hosted models, so text submitted to these tools is sent to OpenRouter and the selected model provider. AI suggestions are not sent automatically. Free-model availability and quotas are controlled by OpenRouter and can change.

## API

The browser uses same-origin endpoints for account enrollment, authentication, password setup, and session-protected mail operations. Public actions are rate-limited. Internal call operations remain protected by `Authorization: Bearer <CALLS_API_TOKEN>` and the token must stay server-side.

Operational endpoints are `GET /healthz` and `GET /readyz`. Telnyx callbacks are signature-verified. Voice events and call records are retained indefinitely; no call audio is recorded.

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) describes the services, data flow, and security boundaries.
- [CONTRIBUTION.md](CONTRIBUTION.md) describes code and change conventions.
- [frontend/README.md](frontend/README.md) describes frontend development and container serving.
