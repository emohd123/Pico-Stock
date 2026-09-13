# Pico AI operations

## Implementation and deployment status

The Next.js admin, screen API, private download page and image processor are implemented locally. Supabase migrations and the scheduled retention function are already applied to the existing Pico Stock project `iclmzodwmqetoibgmrtz`.

Website publishing remains pending: the saved Vercel project returns 404 and is absent from the connected account's project listing. Do not deploy this code into the unrelated Events Hub project. Confirm the current Pico Stock hosting project and public HTTPS domain first.

## Configuration

Existing server variables reused: `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`, and SMTP variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`). Never put the service or Google keys in frontend/native configuration.

Set `PICO_AI_SITE_URL` to the actual HTTPS website origin. Optional `PICO_AI_IMAGE_MODEL` defaults to `gemini-3.1-flash-image`, which was accessible and successfully generated both outfit test results with the existing key. The admin refuses to enable live mode without a configured HTTPS photo address and Google key.

The main event starts in Demo mode with 20 paid attempts and a US$5 allowance. Live attempts reserve US$0.25 atomically before processing. The reservation is deliberately conservative and is retained after uncertain failures; it is not the exact Google invoice. Limits apply to this event, not other applications sharing the Google key. Do not enable automatic model fallback or unbounded retries.

## API and storage

- `/api/pico-ai/admin/*`: existing admin session required; event controls, screens, private photo review and deletion.
- `/api/pico-ai/pair`: rate-limited eight-digit, ten-minute, one-use pairing.
- Screen endpoints require a scoped device token; sessions and jobs additionally require the session bearer secret.
- Images are normalized to 768 × 1024 and uploaded through an authenticated endpoint with a 2 MB limit. This replaces long-lived signed upload permissions, so expired/cancelled sessions cannot upload afterward, while remaining below Vercel's request limit.
- Processing is an awaited server request with durable database stages and idempotent claims. Kiosks poll/recover saved jobs. Unknown provider outcomes are not automatically retried or charged again.
- Private JPEGs live in `pico-ai-private`. Public QR tokens grant only their associated unexpired poster; storage URLs expire after 60 seconds. Download requests are counted, not claimed as verified downloads or unique people.
- The admin currently shows the first configured event, recent 1,000 attempts and up to 10,000 session records. Completion history survives photo expiry/deletion. No facial identification or public guest gallery is enabled.

## Retention and operation

Captures and intermediate images are removed when processing finishes. The Supabase `pico-ai-cleanup` function runs every 15 minutes, selecting abandoned captures after 45 minutes and expired posters after 24 hours. Expired posters are denied immediately on access; physical removal follows the cleanup pass. Failed deletions remain eligible for retry.

The cleanup endpoint has a separate random secret, stored as a hash in a service-only table; its scheduler holds the secret. It does not allow unauthenticated cleanup even though JWT gateway verification is disabled. The scheduled HTTP execution returned 200 during verification. Inspect scheduler/HTTP status if cleanup is delayed; the admin also provides a manual cleanup action.

Pause prevents new sessions. Return-to-welcome resets screen state on its next heartbeat. Revoke pairing disconnects a screen. Delete revokes a photo link and removes its files; short-lived storage URLs already issued can remain usable for their remaining lifetime of up to 60 seconds.

Email delivery is one deliberate request per poster and uses existing SMTP settings. The email address is not saved in the photo database. An uncertain SMTP failure does not automatically resend. Sender configuration and actual requested delivery still require a test.

## Build and verification

Use `npm ci` then `npm run build`. `.npmrc` disables optional CUDA binary downloads; matting runs on CPU. The model, Hegra image, font and Linux ONNX runtime are explicitly included in Next.js file tracing. Keep the function within hosting size/memory/time limits when publishing; server max duration is 300 seconds.

Final local production build and admin browser navigation passed on 11 September 2026. The package check found all required assets and a 201.70 MiB traced function. Confirm the final Linux hosting bundle and runtime limits during deployment. The local production environment had an empty service credential; it was filled from the matching project's existing local credential. The hosting environment still needs its own configured server credential.

Verification scripts in `scripts/`:

- `verify-pico-ai.mjs`: authenticated demo flow, pairing, duplicate requests, isolation and output.
- `verify-pico-ai-operations.mjs`: private storage, access rejection, concurrent budget cap and deletion.
- `verify-pico-ai-rehearsal.mjs`: twenty synthetic cloud sessions, each revoked afterward.
- `verify-pico-ai-admin.mjs`: browser admin navigation and screenshots.
- `verify-pico-ai-package.mjs`: run after the production build; checks that the model, artwork, font and Linux CPU runtime are included and the traced function stays below 230 MiB.
- `check-pico-ai-provider.mjs`: read-only Google model availability plus local matting.
- `verify-pico-ai-live.mjs`: **paid**, two fictional sample edits with an isolated US$0.50 maximum reservation. Run only as part of an authorized test budget.
- `cleanup-pico-ai-verification.mjs`: removes only the explicitly named verification devices/events and their media.

The main browser rehearsal lives in the kiosk's `scripts/verify-connected-browser.mjs`. Local proof images/screenshots are in `output/pico-ai/` and the kiosk's `output/playwright/`; these are not deployed. Tests do not establish real-device camera compatibility, real-guest likeness, public HTTPS hosting or email delivery.

Security advisory review found no new error-level issues in the Pico AI tables/functions. RLS without client policies is intentional because all data access is server-only. The existing unrelated database has advisory findings, including a [security-definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view); those were not changed in this task.
