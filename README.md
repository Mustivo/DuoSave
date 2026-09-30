# DuoSave

A savings app for exactly two people.

- `backend/`  Node.js + Express + TypeScript + Supabase (Postgres + Auth)
- `mobile/`   React Native + TypeScript (Expo), light and dark mode

## How it works
1. Each partner creates an account. One creates a vault and shares the invite code; the other joins. A vault holds two people, enforced in the database.
2. On the vault's reminder day (09:00) the server messages both partners. They open the app and type how much they saved. No payment provider is involved.
3. A loan is taken with one tap. The amount leaves the shared total immediately (checked inside a locked database function so it can't overdraw). Repaying puts the money back. The partner is notified of everything.

## Run it
1. Backend: see `backend/README.md`
2. Mobile: see `mobile/README.md`
