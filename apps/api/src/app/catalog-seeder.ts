import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import { seedHealth } from '@all-in-one/applets/health/api';

/**
 * Keeps the applet catalogs (exercises, activities, programs, diets, recipes) in the database on every start.
 * The seeds only upsert catalog rows, so each release ships its catalog changes without `db:seed`, which would
 * also create the development admin account.
 */
@Injectable()
export class CatalogSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      await seedHealth(this.prisma);
    } catch (error) {
      // A stale catalog must not keep the api down.
      this.logger.error('Could not sync the applet catalogs', error);
    }
  }
}
