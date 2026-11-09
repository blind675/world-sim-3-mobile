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

This folder is the [mobile GitHub repository](https://github.com/blind675/world-sim-3-mobile) and is linked to the [Expo project](https://expo.dev/accounts/blind675/projects/flatworld-simulator). `app.json` contains its EAS project ID and native app identifiers. `eas.json` defines separate development, preview, and production environments. The Expo project has `EXPO_PUBLIC_API_URL` set to the Railway API in each environment. It is a public URL, not a secret.

The [TestFlight workflow](.eas/workflows/testflight.yml) runs on pushes to `main` after the Expo project is connected to this GitHub repository. It typechecks and bundles iOS, creates a signed production `.ipa`, then uploads that build to App Store Connect for TestFlight. `autoIncrement` in the production build profile gives every build a new build number. The workflow currently builds on every push, including JavaScript-only changes, so each push can become a new TestFlight build. This uses Expo build minutes and Apple's processing time.

**One-time GitHub connection:** In [Expo account settings](https://expo.dev/settings), connect GitHub under **Connections** and authorize the Expo GitHub App for `blind675/world-sim-3-mobile`. Then open the [Expo project's GitHub settings](https://expo.dev/accounts/blind675/projects/flatworld-simulator/settings/github), select that repository, and keep the source directory at `/`. This connection is needed for push triggers; the EAS CLI login alone does not connect GitHub.

**Apple setup:** The `Catalin-Andrei BORA` individual Apple Developer team owns `com.blind675.flatworldsim`. Expo stores a dedicated distribution certificate and provisioning profile for this app, and an App Store Connect API key on the same team is assigned for EAS Submit. The key is not committed to Git. Create or confirm the app record in App Store Connect for the same bundle identifier; set the submission profile's `ascAppId` once Apple assigns the app ID. Configure an internal TestFlight group with automatic distribution if testers should receive each uploaded build automatically. The app currently uses only platform HTTPS encryption, so `ios.config.usesNonExemptEncryption` is `false`; revisit this declaration if cryptography is added.

To run the workflow manually, use `npx eas-cli@latest workflow:run .eas/workflows/testflight.yml`. Monitor builds and submissions in the Expo dashboard. Uploading to TestFlight does not publish the app to the public App Store; that promotion remains a separate App Store Connect action. Android release automation can be added later.
