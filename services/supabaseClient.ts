import { createClient } from '@supabase/supabase-js';

// Safe access for import.meta.env
// The vite-env.d.ts file should handle types, but we use a fallback to be safe at runtime
const getEnvVar = (key: string): string => {
  try {
    return import.meta.env[key] || '';
  } catch (e) {
    console.warn(`Error accessing environment variable ${key}`, e);
    return '';
  }
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_KEY');

if (!supabaseUrl || !supabaseKey) {
  console.warn("Supabase credentials missing! Check Vercel Environment Variables or .env file.");
}

// Initialize client with fallbacks to prevent immediate crash
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);