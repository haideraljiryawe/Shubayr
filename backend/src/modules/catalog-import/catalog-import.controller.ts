import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  CatalogImageBulkQueryDto,
  CatalogImportCommitDto,
  CatalogImportHistoryQueryDto,
  CatalogImportPreviewQueryDto,
} from './catalog-import.dto';
import { CatalogImportService } from './catalog-import.service';
import type { CatalogUpload } from './catalog-import.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/catalog-imports')
@RequirePermissions('catalog.import')
export class CatalogImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Get('template')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header(
    'Content-Disposition',
    'attachment; filename="shubayr-catalog-import.xlsx"',
  )
  async template() {
    return new StreamableFile(await this.imports.template());
  }

  @Post('preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  preview(
    @Req() request: AdminRequest,
    @UploadedFile() file: CatalogUpload | undefined,
    @Query() query: CatalogImportPreviewQueryDto,
  ) {
    return this.imports.preview(
      file,
      query.create_missing ?? false,
      request.user,
    );
  }

  @Get()
  list(
    @Req() request: AdminRequest,
    @Query() query: CatalogImportHistoryQueryDto,
  ) {
    return this.imports.list(
      query.page,
      query.per_page,
      request.user.permissions,
    );
  }

  @Get(':id')
  get(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.imports.get(id, request.user.permissions);
  }

  @Get(':id/error-report')
  async errorReport(
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="catalog-import-${id}-errors.csv"`,
    );
    return new StreamableFile(await this.imports.errorReportFile(id));
  }

  @Post(':id/commit')
  commit(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: CatalogImportCommitDto,
  ) {
    return this.imports.commit(id, input.operation_id, request.user);
  }
}

@Controller('admin/catalog-images')
@RequirePermissions('catalog.import')
export class CatalogImageImportController {
  constructor(private readonly imports: CatalogImportService) {}

  @Post('bulk')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
  )
  bulk(
    @Req() request: AdminRequest,
    @UploadedFile() file: CatalogUpload | undefined,
    @Query() query: CatalogImageBulkQueryDto,
  ) {
    return this.imports.bulkImages(file, query.operation_id, request.user);
  }
}
