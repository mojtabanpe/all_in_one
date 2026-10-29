import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma commands run from the workspace root (see the prisma-* targets in
// project.json), so dotenv picks up the root .env file and paths below are
// relative to this file.
export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
    // The api app composes the seed from every applet.
    seed: 'tsx --tsconfig tsconfig.base.json apps/api/src/seed.ts',
  },
  datasource: {
    // process.env rather than env() so `prisma generate` works without a database.
    url: process.env['DATABASE_URL'],
  },
});
