# CloudTerm

A minimal, fast, dark-themed Progressive Web App (PWA) terminal for **Web Serial** and **SSH** (via a tiny local Go relay), backed by **Firebase Hosting**, **Google OAuth**, and **Cloud Firestore** sync.

## Features

- **Web Serial & SSH:** Switch cleanly between browser-native Web Serial (`navigator.serial`) and SSH via a lightweight local Go WebSocket relay (`ws://localhost:8022`).
- **Cloud Sync & Offline Fallback:** Sign in with Google to sync recent connections, pinned targets, and sticky default settings under `users/{uid}` in Firestore. Works seamlessly offline or signed out via `localStorage`.
- **Zero-Bloat Terminal:** Full-height `@xterm/xterm` canvas with automatic resize fitting, copy-on-select, and right-click paste.
- **PWA Ready:** Installable on desktop and mobile with offline asset caching via `vite-plugin-pwa`.

## Frontend Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure Firebase environment variables (copy `.env.example` to `.env`):
   ```env
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

3. Run locally or build for production:
   ```bash
   npm run dev
   npm run build
   ```

4. Deploy to Firebase Hosting & Firestore Rules:
   ```bash
   firebase deploy
   ```

## Local SSH Relay

See [relay/README.md](relay/README.md) for build and run instructions:

```bash
cd relay
go run .
```
