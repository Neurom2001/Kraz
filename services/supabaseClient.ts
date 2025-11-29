import { createClient } from '@supabase/supabase-js';

// Safe access to environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials missing! Check your .env file or Vercel Environment Variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
