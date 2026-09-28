<!-- Purpose: define the contribution, code quality, documentation, and secret-handling rules for ईMAIL. -->

# Contribution guide

## Code conventions

- Use Node.js ES modules, two-space indentation, semicolons, and descriptive names.
- Add a purpose header to every source, script, and infrastructure file. Add JSDoc to every function and explanatory comments beside configuration constants and non-obvious variables.
- Keep API, worker, database, and SMTP concerns separated. Do not put provider keys, API tokens, or database passwords in tracked files.
- Put local credentials in `.env`. Keep `.env` ignored by Git and update `.env.example` when configuration changes.
- Validate external data at API boundaries. Normalize Indian numbers once and store the canonical `+91` E.164 form.
- Make webhook handling signature-verified, idempotent, and safe for duplicate or out-of-order delivery.
- Do not automatically retry outbound calls. Persist terminal failures and release the number's active-call reservation.
- Do not record call audio. Retain full voice event payloads and call metadata without a TTL; never retain OTP text from messaging callbacks.
- Keep SMTP and MongoDB private to the Compose network. The API is published on loopback for Tailscale Funnel and on the configured host LAN IPv4 address for local devices.
- Add comments to explain why behavior exists, not to restate the line of code.

## Change workflow

1. Read `ARCHITECTURE.md` before changing service boundaries, provider callbacks, or data models.
2. Update `.env.example`, `README.md`, and architecture documentation when configuration or runtime behavior changes.
3. Keep one responsibility per module and return structured errors from API routes.
4. Review `git diff` before sharing changes. Never include `.env`, call OTPs, webhook payloads, or real phone numbers in commits or examples.
5. Run verification only when the task owner asks for it; the current build request explicitly reserves testing for the owner.
