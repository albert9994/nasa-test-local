# FieldShift Mobile (Tauri 2, iOS + Android)

The phone app. Same engine and data as the desktop app, with a phone-first UI:

- **Onboarding funnel** (`packages/ui/src/components/mobile/funnel.tsx`), modelled on big consumer apps:
  intro carousel (swipe, auto-advance, RO/EN switch, "open the demo farm") → what worries you (multi-select) → farm size
  (single tap, moves on by itself) → trust screen (NASA POWER, NEX-GDDP-CMIP6, SoilGrids, satellite) → place ("Use my
  location", search, or tap the map) → tap fields on the map, size with −/+ steppers → crops per field (icon tiles, one
  field per screen) → risk tolerance ("1 bad year in N", visual) → weather-alerts opt-in → **"Building your farm plan"**
  (the engine really runs per field while the checklist ticks) → **reveal**: safety margin in °C and a traffic light per
  field → app. One question per screen, a segmented progress bar, the main button in thumb reach, back on every step.
- **App** (`packages/ui/src/components/mobile/mobile-app.tsx`): bottom tab bar (Farm · Alerts · Settings). Farm =
  map with risk colours, "needs attention" cards, the field list, "+ Add field" (bottom sheet) and "Share report" (system
  share sheet). Tapping a field pushes the full analysis (all eight tabs from `components/field`). Alerts = 7-day weather
  alerts per field. Settings = tolerance, means (budget, equipment, sellable crops), language, currency, theme, replay the intro, start over.
- Phone details: safe areas (notch / home indicator), 16 px inputs (no iOS zoom), no rubber-band on the page, Android back
  button and iOS edge swipe close the open screen or sheet, haptic ticks where supported, light and dark.

Funnel answers that only the phone uses (worries, farm size, alerts) live in `packages/ui/src/lib/store/mobile.ts`;
the farm itself is the same `useFarm` store as desktop. Texts: `packages/ui/src/lib/i18n/messages/mobile.ts`.

## Run in a browser (phone size)

```bash
pnpm install
pnpm --filter mobile dev        # http://localhost:1430, then use the browser's device toolbar (e.g. iPhone 14)
```

## Run on a phone

Needs the Rust toolchain plus **Xcode** (iOS) or **Android Studio + NDK** (Android).

```bash
# one time
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios                       # iOS
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android  # Android
pnpm --filter mobile tauri ios init        # creates src-tauri/gen/apple (commit it)
pnpm --filter mobile tauri android init    # creates src-tauri/gen/android (commit it)

# develop
pnpm --filter mobile tauri ios dev         # simulator or a plugged-in iPhone
pnpm --filter mobile tauri android dev     # emulator or a plugged-in phone

# release
pnpm --filter mobile tauri ios build
pnpm --filter mobile tauri android build
```

After `ios init`, add the location prompt text to `src-tauri/gen/apple/fieldshift-mobile_iOS/Info.plist`
(for "Use my location"):

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>FieldShift uses your location to find your farm's weather and soil data.</string>
```

On Android, add `<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />` to
`src-tauri/gen/android/app/src/main/AndroidManifest.xml`. Without these the button falls back to search / tapping the map.

## Engine

`src-tauri/src/lib.rs` includes the desktop's `native.rs` by path, so phones run `fieldshift-core` natively (same
commands, same JSON as WASM). Build without it (`--no-default-features`) and the UI uses the engine in a Web Worker.

## Server URL
Same as desktop: `VITE_API_URL=https://api.example.com pnpm --filter mobile dev` for the AI advisor; empty = offline templates.
