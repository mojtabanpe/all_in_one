import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from '@all-in-one/api/auth';
import { PrismaClient } from '@all-in-one/api/db';
import { seedHealth } from '@all-in-one/applets/health/api';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

async function main() {
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: await hashPassword('change-me-admin'),
      emailVerifiedAt: new Date(),
    },
  });
  // Applet catalogs (idempotent). English starter decks ship in code.
  await seedHealth(prisma);
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
