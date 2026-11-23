import { Module } from '@nestjs/common';
import { ErrorsController, UsageController } from './usage.controller';

@Module({ controllers: [UsageController, ErrorsController] })
export class UsageModule {}
