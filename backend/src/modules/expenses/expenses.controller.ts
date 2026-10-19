import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import type { UploadedImage } from '../media/media.service';
import {
  CreateExpenseCategoryDto,
  CancelPrepaidScheduleDto,
  CreateExpenseDto,
  ExpenseFormOptionsQueryDto,
  ExpenseQueryDto,
  PayExpenseDto,
  PostExpenseDto,
  ReverseExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto/expenses.dto';
import { ExpensesService } from './expenses.service';

type AdminRequest = Request & { user: AuthenticatedRequestUser };
const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 422 });

@Controller('admin/expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @AdminPolicy('expenses.read')
  list() {
    return this.expenses.listCategories();
  }

  @Get('ledger-accounts')
  @AdminPolicy('expense_categories.manage')
  ledgerAccounts() {
    return this.expenses.listExpenseLedgerAccounts();
  }

  @Post()
  @AdminPolicy('expense_categories.manage')
  create(
    @Req() request: AdminRequest,
    @Body() input: CreateExpenseCategoryDto,
  ) {
    return this.expenses.createCategory(request.user.id, input);
  }

  @Patch(':id')
  @AdminPolicy('expense_categories.manage')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateExpenseCategoryDto,
  ) {
    return this.expenses.updateCategory(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  @AdminPolicy('expense_categories.manage')
  remove(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.expenses.removeCategory(request.user.id, id);
  }
}

@Controller('admin/expense-receipts')
export class ExpenseReceiptsController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @AdminPolicy('expenses.create')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  upload(
    @Req() request: AdminRequest,
    @UploadedFile() file: UploadedImage | undefined,
  ) {
    return this.expenses.uploadReceipt(request.user.id, file);
  }

  @Get(':id')
  @AdminPolicy('expenses.read')
  async download(
    @Param('id', uuid) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const receipt = await this.expenses.downloadReceipt(id);
    response.set({
      'Content-Type': receipt.mimeType,
      'Content-Length': receipt.sizeBytes.toString(),
      ETag: `"${receipt.checksum}"`,
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    });
    response.send(receipt.body);
  }
}

@Controller('admin/expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @AdminPolicy('expenses.create')
  create(
    @Req() request: AdminRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CreateExpenseDto,
  ) {
    return this.expenses.create(
      { id: request.user.id, permissions: request.user.permissions },
      key,
      input,
    );
  }

  @Get()
  @AdminPolicy('expenses.read')
  list(@Query() query: ExpenseQueryDto) {
    return this.expenses.list(query);
  }

  @Get('totals')
  @AdminPolicy('expenses.read')
  totals(@Query() query: ExpenseQueryDto) {
    return this.expenses.totals(query);
  }

  @Get('form-options')
  @AdminPolicy('expenses.create')
  formOptions(@Query() query: ExpenseFormOptionsQueryDto) {
    return this.expenses.formOptions(query);
  }

  @Get(':id')
  @AdminPolicy('expenses.read')
  get(@Param('id', uuid) id: string) {
    return this.expenses.get(id);
  }

  @Patch(':id')
  @AdminPolicy('expenses.create')
  update(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Body() input: UpdateExpenseDto,
  ) {
    return this.expenses.updateDraft(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      input,
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @AdminPolicy('expenses.create')
  remove(@Req() request: AdminRequest, @Param('id', uuid) id: string) {
    return this.expenses.deleteDraft(request.user.id, id);
  }

  @Post(':id/post')
  @HttpCode(200)
  @AdminPolicy('expenses.post')
  post(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PostExpenseDto,
  ) {
    return this.expenses.post(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      key,
      input,
    );
  }

  @Post(':id/payments')
  @AdminPolicy('expenses.pay')
  pay(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: PayExpenseDto,
  ) {
    return this.expenses.pay(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      key,
      input,
    );
  }

  @Post(':id/reverse')
  @AdminPolicy('expenses.reverse')
  reverse(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: ReverseExpenseDto,
  ) {
    return this.expenses.reverse(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      key,
      input,
    );
  }

  @Post(':id/prepaid-schedule/cancel')
  @AdminPolicy('expenses.reverse')
  cancelPrepaidSchedule(
    @Req() request: AdminRequest,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: CancelPrepaidScheduleDto,
  ) {
    return this.expenses.cancelPrepaidSchedule(
      { id: request.user.id, permissions: request.user.permissions },
      id,
      key,
      input,
    );
  }
}
