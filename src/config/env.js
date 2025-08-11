import 'dotenv/config';

export const env = {
  PORT: Number(process.env.PORT || 8080),

  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,

  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,

  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin@123'
};
