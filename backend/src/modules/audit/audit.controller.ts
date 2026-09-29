import { Controller, Get, Query } from '@nestjs/common';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import { AuditReaderService } from './audit-reader.service';
import { AuditLogQueryDto } from './dto/audit-query.dto';

@Controller('admin/audit-logs')
@AdminPolicy('audit.view')
export class AuditController {
  constructor(private readonly audit: AuditReaderService) {}

  @Get()
  list(@Query() query: AuditLogQueryDto) {
    return this.audit.list(query);
  }
}
