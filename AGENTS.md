# Mobile agent context

Read README.md before substantial changes. The backend in blind675/world-sim-3-server owns simulation state and the API. The existing web viewer is in blind675/world-sim-3-client. Keep mobile API requests compatible with the backend and preserve the public viewer's read-only behavior. Never put CONTROL_API_TOKEN or another secret in EXPO_PUBLIC_* variables. Measure device performance before changing the terrain API or replacing the Skia renderer.

## Branch and release policy

`staging` is the integration branch for ordinary work in all three repositories (server, web client, mobile). Before editing, fetch and switch to `staging`; commit and push fixes, features, and documentation there. Do not commit or push routine work to `main`, even if the local checkout starts on `main`. Keep GitHub's default branch as `main` for now.

`main` is the production release branch. Merge or push to `main` only when the user explicitly requests a release to `main`, after reviewing the staging diff and running the relevant checks. A staging push is not a release. The EAS TestFlight workflow triggers on `main` pushes, so never use `main` for routine mobile changes. See the backend's [release workflow](https://github.com/blind675/world-sim-3-server/blob/staging/docs/RELEASE_WORKFLOW.md) for cross-repository release steps. Tell the user which branch received each change.
