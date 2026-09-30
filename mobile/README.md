# DuoSave mobile (React Native + TypeScript, Expo SDK 57)

Requires Node.js 22.13 or newer.

1. `cp .env.example .env` and set `EXPO_PUBLIC_API_URL` to your backend (use your computer's LAN IP on a real phone).
2. `npm install`
3. `npx expo start`, then scan the QR code with Expo Go (or press `a` / `i` for an emulator).

Expo Go must be a version that supports SDK 57. If the store version has already moved to a newer SDK, build a development build instead:
`npx expo run:android` (or `run:ios`).

Push messages need a real device. Light and dark mode follow the phone by default; change it in Account.
