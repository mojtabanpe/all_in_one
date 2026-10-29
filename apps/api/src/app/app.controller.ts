import { Controller, Get } from '@nestjs/common';
import { Public } from '@all-in-one/api/auth';
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
