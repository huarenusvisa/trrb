# AsylumJudge Mobile

A separate Expo/React Native app for testing AsylumJudge on iOS and Android.

## Local verification

```bash
cd apps/asylumjudge-mobile
npm install
npm run typecheck
npm test
```

## Test builds

The first build requires linking this directory to a dedicated EAS project. Do not reuse the Tang Daily EAS project or its bundle identifiers.

```bash
npx eas-cli init
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile production
```

Android preview produces an installable APK. The iOS production build is distributed through TestFlight after the Apple app record and signing credentials are connected.
