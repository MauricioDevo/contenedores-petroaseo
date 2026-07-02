import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Verificar si las variables de entorno están configuradas
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== "tu_url_de_supabase_aqui");

export const supabase = isSupabaseConfigured 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

if (!isSupabaseConfigured) {
    console.warn("⚠️ Supabase no está configurado. La aplicación se ejecutará en modo local con localStorage. Crea un archivo .env o configúralo en Vercel para conectarlo.");
}
