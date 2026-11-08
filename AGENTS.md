# Mobile agent context

Read README.md before substantial changes. The backend in blind675/world-sim-3-server owns simulation state and the API. The existing web viewer is in blind675/world-sim-3-client. Keep mobile API requests compatible with the backend and preserve the public viewer's read-only behavior. Never put CONTROL_API_TOKEN or another secret in EXPO_PUBLIC_* variables. Measure device performance before changing the terrain API or replacing the Skia renderer.
