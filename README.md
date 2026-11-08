# FlatWorld Simulator Mobile

Native iOS and Android viewer for the FlatWorld simulation. This is an Expo and React Native application with a Skia terrain renderer. It talks directly to the public, read-only API in [world-sim-3-server](https://github.com/blind675/world-sim-3-server). The web viewer remains a separate project.

## Run

Use an Expo-supported Node.js release (22.13+, 24.3+, or 26+). From this folder:

```sh
npm ci
cp .env.example .env
npm start
```

Open the Expo QR code on a phone with a compatible Expo Go build, or create an Expo development build. Development builds are recommended for testing native behavior and for future store releases. `npm run ios` and `npm run android` launch local simulators if installed. The app defaults to the deployed Railway API; set `EXPO_PUBLIC_API_URL` to a different HTTPS API origin for another environment. This is a public client variable, so it must never contain an API control token.

The app loads world metadata, cached terrain chunks, and nearby objects and agents. Pan and pinch the map, tap an agent or object for details, or use **Find agent** to jump to any living agent. **Follow agent** keeps the camera centered on its current position. Manual panning turns follow off. Polling pauses while the app is in the background.

The app icon assets are generated from `scripts/generate-icons.mjs` with `npm run icons`.

## Checks

```sh
npm run typecheck
npx expo export --platform ios --platform android
```

The mobile app is currently a read-only viewer. Its terrain tiles are generated from the existing JSON chunk API and cached in memory. This avoids changing the backend before device measurements show whether terrain transfer or rasterization needs a more compact format.

## Repository and deployment

The Expo scaffold created a local Git repository in this folder. It has no remote; connect it to the new repository when ready. App Store identifiers, signing credentials, EAS project configuration, and CI/CD are deferred until then. A future EAS pipeline can publish compatible JavaScript and asset changes with EAS Update; native library or configuration changes require new iOS and Android builds.
