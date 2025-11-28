import { createClient } from '@supabase/supabase-js';

// Vercel Environment Variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key. Check Vercel Environment Variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');
