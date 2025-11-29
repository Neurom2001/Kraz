import { createClient } from '@supabase/supabase-js';

// Safe access for import.meta.env to prevent "Cannot read properties of undefined"
// We use 'any' casting to bypass strict TypeScript checks that might conflict with the build environment
const getEnvVar = (key: string) => {
  try {
    return (import.meta as any).env?.[key] || '';
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

// Initialize client with fallbacks to prevent immediate crash, though requests will fail if keys are missing
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder'
);