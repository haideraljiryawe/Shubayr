import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditReaderService } from './audit-reader.service';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReaderService],
  exports: [AuditService],
})
export class AuditModule {}
