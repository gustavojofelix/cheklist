// Local development (Supabase CLI stack). Only the public URL and the publishable/anon key
// belong here — every security rule is enforced by Postgres RLS on the server.
export const environment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabaseKey: 'LOCAL_ANON_KEY',
};
