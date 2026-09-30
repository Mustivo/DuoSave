import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
export const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
export const anon = createClient(url, process.env.SUPABASE_ANON_KEY!, {
  auth: { persistSession: false },
});
