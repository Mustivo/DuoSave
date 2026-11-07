import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;

export const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
export const anon = createClient(url, anonKey, {
  auth: { persistSession: false },
});
