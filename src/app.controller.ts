import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return {
      name: 'TaskFlow API',
      version: '0.1.0',
      docs: '/api/docs',
    };
  }
}
