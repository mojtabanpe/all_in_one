import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { AppService } from './app.service';

@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getData() {
    return this.appService.getData();
  }
}
