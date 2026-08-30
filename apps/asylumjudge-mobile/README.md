# AsylumJudge Mobile

Independent Expo application for verified U.S. immigration judge and court statistics.

## Local checks

```bash
npm install
npm run audit
npm run typecheck
npx expo export --platform web
```

The app reads the existing public AsylumJudge API. It does not contain copied decision records or estimated approval rates. Rates below the API's minimum sample threshold remain hidden.

The iOS bundle identifier, Android package, URL scheme, and EAS configuration are independent from `apps/mobile`. No EAS project ID is assigned until a dedicated AsylumJudge project is created.
