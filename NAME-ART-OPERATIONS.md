# Name Art booth

Live admin: https://pico-stock.vercel.app/admin/pico-ai/name-art

1. Sign into Pico admin and open **Name Art Experience**.
2. Choose a fixed background, display time (8–60 seconds), and reveal style. The default is the supplied pearl-and-ribbon design. Save settings.
3. Create an **iPad** pairing code. On the iPad, open https://pico-stock.vercel.app/name-art/tablet and enter that eight-digit code.
4. Create a separate **poster screen** code. On Android Chrome, open https://pico-stock.vercel.app/name-art/screen and pair it. Use Chrome's **Install app / Add to Home screen**, then launch the installed app in portrait. This is an installable web app, not an APK.
5. Enter a guest's name on the iPad, confirm permission to show it publicly, and create the poster. The Android screen receives guests in order. Each result has its own private download QR. The admin also provides poster and QR downloads.

English uses an emerald serif name with antique-gold edging. Arabic names use an embedded Arabic font. Names are fitted to the safe area of the selected background. The downloaded JPEG is 1536 × 2304 pixels and contains the actual guest name.

The three supplied backgrounds are preserved as fixed compositions. Changing the selected background affects new guests only. All paired screens share one booth queue. The screen shows each name for the configured interval, then returns to the artwork or advances to the next guest. Pause stops new submissions and clears the display. Reduced-motion preferences disable decorative animation.

## Event operation

- Both devices need internet. Pairing codes expire after ten minutes and work once. Disconnect a lost or retired device from admin.
- Guest links expire after 48 hours. Anyone holding a guest link can access that poster until expiry; there is no public gallery.
- Use **Remove expired guest posters** in admin after the event. Expiry blocks access automatically; stored images are physically removed by this cleanup action.
- Use device kiosk controls / screen pinning for unattended operation. The web app requests a wake lock when supported; device power settings still apply.
- Test the actual iPad, Android display, and phone QR camera at the venue before opening. Browser viewport tests do not replace those hardware checks.

## Implementation and recovery

Uses existing service-only `pico_ai_internal` records and the private `pico-ai-private` storage bucket. No new database migration or AI provider is required. Guest images and private API responses are never cached by the service worker. API requests enforce admin authentication or a paired device role; repeat submissions with the same request ID return the same job.

Keep the existing Supabase service credentials and admin session configuration on Vercel. Native rendering uses `@napi-rs/canvas` with bundled Cinzel and Noto Arabic fonts; asset tracing is included in `next.config.js`. If the screen loses connection, it removes the previous guest after that guest's display slot and resumes polling. Failed generation reports an error rather than showing a simulated success.
