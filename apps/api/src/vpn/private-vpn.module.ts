import { Module } from '@nestjs/common';
import { PrismaModule } from '@all-in-one/api/db';
import { PrivateVpnService } from './private-vpn.service';

@Module({
  imports: [PrismaModule],
  providers: [PrivateVpnService],
  exports: [PrivateVpnService],
})
export class PrivateVpnModule {}
