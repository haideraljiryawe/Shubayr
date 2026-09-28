import { Module } from '@nestjs/common';
import { PermissionResolverService } from './permission-resolver.service';
import {
  PermissionsController,
  PresetsController,
  StaffController,
  WorkPhonesController,
} from './access-management.controller';
import { AccessManagementService } from './access-management.service';

@Module({
  controllers: [
    StaffController,
    PresetsController,
    PermissionsController,
    WorkPhonesController,
  ],
  providers: [PermissionResolverService, AccessManagementService],
  exports: [PermissionResolverService],
})
export class RbacModule {}
