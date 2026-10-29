import { Module } from '@nestjs/common';
import { EnglishController } from './english.controller';
import { EnglishService } from './english.service';

/** English-learning applet backend. Needs PrismaModule and the global AuthGuard from the host app. */
@Module({
  controllers: [EnglishController],
  providers: [EnglishService],
})
export class EnglishApiModule {}
