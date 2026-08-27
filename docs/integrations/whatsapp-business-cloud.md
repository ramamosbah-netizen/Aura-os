# WhatsApp Business Cloud API

AURA treats WhatsApp as a channel in Communication Center. It uses Meta's official Business
Cloud API; personal WhatsApp accounts, QR sessions and WhatsApp Web scraping are intentionally
unsupported.

## Configure

Set these API environment values (use a secret manager in production):

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- optional `WHATSAPP_API_VERSION` (defaults to `v23.0`)

In the Meta app, set the callback URL to:

`https://<public-aura-host>/api/v1/whatsapp/webhook`

Use the same verify token, subscribe to `messages`, and ensure Meta can reach the host over HTTPS.
The endpoint validates `X-Hub-Signature-256`, maps `phone_number_id` to a tenant's connected
communication account, and deduplicates message IDs before writing anything.

## Runtime behaviour

Inbound messages create a tenant-scoped WhatsApp thread, match an active CRM contact by normalized
phone when possible, write a Communication timeline entry, and create an in-app notification for
the thread owner (or a tenant broadcast when no owner is known). Replies use the Cloud API and are
tracked through `queued → sent → delivered → read` (or `failed`). Read receipts update the message
and notify the internal sender.

The web inbox receives `whatsapp` Server-Sent Events and falls back to the last loaded state. Shared
files remain references to Document Control; WhatsApp media is not copied into a second document
store by this integration.
