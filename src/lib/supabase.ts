import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      // Sesi harus disimpan supaya pemilik warung tidak perlu login lagi
      // setiap kali membuka aplikasi. Login juga harus bertahan setelah
      // refresh/reload sampai pengguna menekan Keluar.
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
