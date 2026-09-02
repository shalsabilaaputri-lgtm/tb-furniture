// Compatibility module for the first Vercel build. The production database
// adapter replaces this binding when PostgreSQL is connected.
export const env: { DB?: D1Database } = {};
