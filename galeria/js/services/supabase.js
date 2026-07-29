import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../core/config.js';

/** Cliente único: evita configuraciones divergentes entre admin y galería. */
export const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
