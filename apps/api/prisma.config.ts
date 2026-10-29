import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma commands run from the workspace root (see the prisma-* targets in
// project.json), so dotenv picks up the root .env file.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx apps/api/prisma/seed.ts',
  },
  datasource: {
    // process.env rather than env() so `prisma generate` works without a database.
    url: process.env['DATABASE_URL'],
  },
});
