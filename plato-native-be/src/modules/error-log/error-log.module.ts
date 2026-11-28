import { Global, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { AdminLogsController } from './admin-logs.controller';
import { ErrorLogService } from './error-log.service';

// Global: the extension's client-error route and main.ts reach ErrorLogService.
// The filter and the stamp guard are registered in AppModule (APP_FILTER / APP_GUARD).
@Global()
@Module({
  imports: [AdminModule],
  controllers: [AdminLogsController],
  providers: [ErrorLogService],
  exports: [ErrorLogService],
})
export class ErrorLogModule {}
