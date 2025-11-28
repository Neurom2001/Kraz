import { createClient } from '@supabase/supabase-js';

// Safely access environment variables to prevent crashes if env is undefined
const env = (import.meta as any).env || {};
const supabaseUrl = env.VITE_SUPABASE_URL || '';
const supabaseKey = env.VITE_SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials missing! Check your .env or Vercel settings.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);