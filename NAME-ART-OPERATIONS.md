# Name Art booth

Live admin: https://pico-stock.vercel.app/admin/pico-ai/name-art

1. Sign into Pico admin and open **Name Art Experience**.
2. Choose the **resting National Day artwork**, display time (8–60 seconds), grace after Finish, and reveal style. Guests pick their own design, so this artwork is what the poster screen shows between guests. Save settings.
3. Note the **permanent pairing code** in section 03. It works on both devices, any number of times, and never expires, so an unattended booth can reconnect itself. One-use codes remain available for temporary devices.
4. On the entry tablet open https://pico-stock.vercel.app/name-art/tablet and enter the code. On the poster screen open https://pico-stock.vercel.app/name-art/screen and enter the same code. Use Chrome's **Install app / Add to Home screen**, then launch the installed app in portrait. This is an installable web app, not an APK.
5. The guest types a name, picks one of the three designs, confirms permission to show it publicly, and creates the poster. The poster screen shows the finished result only. The guest's private download QR appears on the entry tablet. **Finish** clears the screen after the configured grace period; the display timer clears it anyway if nobody taps Finish.

English uses an emerald serif name with antique-gold edging. Arabic names use an embedded Arabic font. Names are fitted to the safe area of the selected background. The downloaded JPEG is 1536 × 2304 pixels and contains the actual guest name.

The three supplied backgrounds are preserved as fixed compositions and are offered to the guest on the entry tablet. The backdrop is baked into the rendered poster, so it is chosen before generating and cannot be changed afterwards. Changing the admin artwork affects the resting screen only. All paired screens share one booth queue. The screen shows each name for the configured interval, then returns to the artwork or advances to the next guest. Pause stops new submissions and clears the display. Reduced-motion preferences disable decorative animation.

## Event operation

- Both devices need internet. The permanent code never expires and can be reused, so a device that loses its pairing can reconnect without an operator. Anyone who knows it can connect a device, so change it in admin if it is shared too widely. One-use codes still expire after ten minutes and work once. Disconnect a lost or retired device from admin.
- For unattended operation, lock each device to the app with Android **screen pinning** (Settings → Security and privacy → Other security settings → Pin windows), with "Ask for PIN before unpinning" on. That needs a screen lock PIN set on the device first, otherwise the app can be unpinned freely.
- Guest links expire after 48 hours. Anyone holding a guest link can access that poster until expiry; there is no public gallery.
- Use **Remove expired guest posters** in admin after the event. Expiry blocks access automatically; stored images are physically removed by this cleanup action.
- Use device kiosk controls / screen pinning for unattended operation. The web app requests a wake lock when supported; device power settings still apply.
- Test the actual iPad, Android display, and phone QR camera at the venue before opening. Browser viewport tests do not replace those hardware checks.

## Implementation and recovery

Uses existing service-only `pico_ai_internal` records and the private `pico-ai-private` storage bucket. No new database migration or AI provider is required. Guest images and private API responses are never cached by the service worker. API requests enforce admin authentication or a paired device role; repeat submissions with the same request ID return the same job.

Keep the existing Supabase service credentials and admin session configuration on Vercel. Native rendering uses `@napi-rs/canvas` with bundled Cinzel and Noto Arabic fonts; asset tracing is included in `next.config.js`. If the screen loses connection, it removes the previous guest after that guest's display slot and resumes polling. Failed generation reports an error rather than showing a simulated success.
