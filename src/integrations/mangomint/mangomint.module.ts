import { Module } from '@nestjs/common';
import { MangomintService } from './mangomint.service';
import { MangomintController } from './mangomint.controller';

@Module({
  providers: [MangomintService],
  controllers: [MangomintController],
  exports: [MangomintService],
})
export class MangomintModule {}