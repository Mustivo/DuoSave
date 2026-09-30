# DuoSave backend (Node + Express + Supabase)

1. Create a Supabase project. In the SQL editor run `supabase/schema.sql`.
2. `cp .env.example .env` and fill in the three Supabase keys (Project Settings -> API).
3. `npm install && npm run dev`  (API on http://localhost:4000/api)

Reminders: a cron job at 09:00 daily messages both partners when today matches the vault's `reminder_day`.
