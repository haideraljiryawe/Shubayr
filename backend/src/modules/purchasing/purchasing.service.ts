import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { assertDifferentActor } from '../../common/access/separation-of-duties';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { CurrencyService } from '../finance/currency.service';
import { DateRulesService } from '../finance/date-rules.service';
import { DocumentNumberService } from '../finance/document-number.service';
import { LedgerService, type PostingLine } from '../finance/ledger.service';
import { OperationService } from '../finance/operation.service';
import {
  AllocateSupplierCreditDto,
  CreateCostCorrectionDto,
  CreatePurchaseInvoiceDto,
  CreateSupplierPaymentDto,
  CreateSupplierReturnDto,
  PurchasingQueryDto,
  StatementQueryDto,
  SupplierDto,
  SupplierOpeningBalanceDto,
  UpdateSupplierDto,
} from './dto/purchasing.dto';

type Tx = Prisma.TransactionClient;
type DecimalInput = string | number | Prisma.Decimal;
const D = (value: DecimalInput) => new Prisma.Decimal(value);
const date = (value?: string) =>
  value ? new Date(`${value}T00:00:00.000Z`) : undefined;

@Injectable()
export class PurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateRulesService,
    private readonly currencies: CurrencyService,
    private readonly numbers: DocumentNumberService,
    private readonly ledger: LedgerService,
    private readonly operations: OperationService,
  ) {}

  async listSuppliers(page = 1, perPage = 50) {
    const [data, total] = await Promise.all([
      this.prisma.supplier.findMany({
        orderBy: [{ is_active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.supplier.count(),
    ]);
    return { page, per_page: perPage, total, data };
  }

  async supplier(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async createSupplier(actorId: string, input: SupplierDto) {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        address: input.address?.trim() || null,
        notes: input.notes?.trim() || null,
        default_currency: input.default_currency,
        payment_terms_days: input.payment_terms_days,
      },
    });
    await this.audit.record(this.prisma, {
      actorId,
      action: 'supplier.create',
      entityType: 'supplier',
      entityId: supplier.id,
      after: supplier,
    });
    return supplier;
  }

  async updateSupplier(actorId: string, id: string, input: UpdateSupplierDto) {
    const before = await this.supplier(id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name.trim() }),
        ...(input.phone === undefined
          ? {}
          : { phone: input.phone.trim() || null }),
        ...(input.email === undefined
          ? {}
          : { email: input.email.trim() || null }),
        ...(input.address === undefined
          ? {}
          : { address: input.address.trim() || null }),
        ...(input.notes === undefined
          ? {}
          : { notes: input.notes.trim() || null }),
        ...(input.default_currency === undefined
          ? {}
          : { default_currency: input.default_currency }),
        ...(input.payment_terms_days === undefined
          ? {}
          : { payment_terms_days: input.payment_terms_days }),
        ...(input.is_active === undefined
          ? {}
          : { is_active: input.is_active }),
        updated_at: new Date(),
      },
    });
    await this.audit.record(this.prisma, {
      actorId,
      action: 'supplier.update',
      entityType: 'supplier',
      entityId: supplier.id,
      before,
      after: supplier,
    });
    return supplier;
  }

  async deactivateSupplier(actorId: string, id: string) {
    return this.updateSupplier(actorId, id, { is_active: false });
  }

  async openingBalance(
    actorId: string,
    permissions: string[],
    supplierId: string,
    input: SupplierOpeningBalanceDto,
  ) {
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    const amount = this.positive(input.amount, 'amount');
    const rate = this.positive(input.exchange_rate, 'exchange_rate');
    if (input.currency_code === 'IQD' && !rate.equals(1))
      throw new UnprocessableEntityException('The IQD exchange rate must be 1');
    const amountIqd = amount.times(rate);
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/suppliers/${supplierId}/opening-balance`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await this.requireActiveSupplier(tx, supplierId);
        const id = randomUUID();
        const entry = await this.ledger.post(tx, {
          sourceType: 'supplier_opening_balance',
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: 'Supplier opening balance',
          lines: [
            this.line(
              '3000',
              'debit',
              amountIqd,
              input.currency_code,
              amount,
              rate,
            ),
            this.line(
              '2000',
              'credit',
              amountIqd,
              input.currency_code,
              amount,
              rate,
            ),
          ],
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'supplier_opening_balance',
          'SUP-OPEN',
          dates.documentDate,
        );
        const opening = await tx.supplierOpeningBalance.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            supplier_id: supplierId,
            currency_code: input.currency_code,
            amount_currency: amount,
            exchange_rate: rate,
            amount_iqd: amountIqd,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            due_date: date(input.due_date),
            backdate_reason: dates.backdateReason,
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        await tx.supplierAccountEntry.create({
          data: {
            supplier_id: supplierId,
            source_type: 'opening_balance',
            source_id: id,
            opening_balance_id: id,
            document_number: documentNumber,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            due_date: date(input.due_date),
            currency_code: input.currency_code,
            credit_currency: amount,
            credit_iqd: amountIqd,
          },
        });
        return { ...opening, journal_entry: entry };
      },
    });
  }

  async createInvoice(
    actorId: string,
    permissions: string[],
    input: CreatePurchaseInvoiceDto,
  ) {
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one purchase line is required',
      );
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    const rate = await this.transactionRate(
      input.currency_code,
      dates.documentDate,
      input.exchange_rate,
      permissions,
    );
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/purchase-invoices',
      payload: input,
      responseStatus: 201,
      work: (tx) =>
        this.postInvoice(tx, actorId, permissions, input, dates, rate),
    });
  }

  private async postInvoice(
    tx: Tx,
    actorId: string,
    permissions: string[],
    input: CreatePurchaseInvoiceDto,
    dates: {
      documentDate: Date;
      accountingDate: Date;
      backdateReason?: string;
    },
    rate: Prisma.Decimal,
  ) {
    const supplier = await this.requireActiveSupplier(tx, input.supplier_id);
    const defaultLocation = await tx.warehouseLocation.findUnique({
      where: { id: input.default_location_id },
      include: { warehouse: true },
    });
    if (!defaultLocation?.is_active || !defaultLocation.warehouse.is_active)
      throw new ConflictException('The default receiving location is inactive');
    if (input.supplier_invoice_number) {
      const duplicate = await tx.purchaseInvoice.findFirst({
        where: {
          supplier_id: supplier.id,
          invoice_number: input.supplier_invoice_number.trim(),
        },
      });
      if (duplicate)
        throw new ConflictException(
          'The supplier invoice number is already used',
        );
    }

    const prepared = [] as Array<{
      variant: Awaited<ReturnType<Tx['productVariant']['findUniqueOrThrow']>>;
      locationId: string;
      purchaseQuantity: Prisma.Decimal;
      packSize: Prisma.Decimal;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      baseUnitCostCurrency: Prisma.Decimal;
      lineTotalCurrency: Prisma.Decimal;
      landedShareIqd: Prisma.Decimal;
      landedUnitIqd: Prisma.Decimal;
      source: CreatePurchaseInvoiceDto['lines'][number];
    }>;
    let subtotal = D(0);
    for (const source of input.lines) {
      const variant = await tx.productVariant.findUnique({
        where: { id: source.variant_id },
      });
      if (!variant) throw new NotFoundException('Product variant not found');
      const locationId = source.location_id ?? input.default_location_id;
      const location = await tx.warehouseLocation.findUnique({
        where: { id: locationId },
        include: { warehouse: true },
      });
      if (!location?.is_active || !location.warehouse.is_active)
        throw new ConflictException('A receiving location is inactive');
      const purchaseQuantity = this.positive(source.quantity, 'quantity');
      const packSize = this.positive(source.pack_size ?? '1', 'pack_size');
      const quantity = purchaseQuantity.times(packSize);
      if (quantity.decimalPlaces() > 3)
        throw new UnprocessableEntityException(
          'Base quantity supports at most 3 decimals',
        );
      if (variant.whole_units_only && !quantity.isInteger())
        throw new UnprocessableEntityException(
          'Piece SKUs require whole base units',
        );
      const unitCost = this.positive(source.unit_cost, 'unit_cost');
      const lineTotalCurrency = purchaseQuantity.times(unitCost);
      const baseUnitCostCurrency = unitCost.div(packSize);
      subtotal = subtotal.plus(lineTotalCurrency);
      prepared.push({
        variant: variant,
        locationId,
        purchaseQuantity,
        packSize,
        quantity,
        unitCost,
        baseUnitCostCurrency,
        lineTotalCurrency,
        landedShareIqd: D(0),
        landedUnitIqd: D(0),
        source,
      });
    }
    const landed = [] as Array<{
      kind: string;
      description?: string;
      currencyCode: string;
      amountCurrency: Prisma.Decimal;
      amountIqd: Prisma.Decimal;
    }>;
    let landedIqd = D(0);
    let landedInvoiceCurrency = D(0);
    for (const cost of input.landed_costs ?? []) {
      const amount = this.positive(cost.amount, 'landed_cost.amount');
      const costRate =
        cost.currency_code === input.currency_code
          ? rate
          : await this.currencies.requireRate(
              cost.currency_code,
              dates.documentDate,
            );
      const amountIqd = amount.times(costRate);
      landedIqd = landedIqd.plus(amountIqd);
      landedInvoiceCurrency = landedInvoiceCurrency.plus(amountIqd.div(rate));
      landed.push({
        kind: cost.kind.trim(),
        description: cost.description?.trim(),
        currencyCode: cost.currency_code,
        amountCurrency: amount,
        amountIqd,
      });
    }
    this.allocateLanded(prepared, landedIqd, input.allocation_method, rate);
    const totalCurrency = subtotal.plus(landedInvoiceCurrency);
    const totalIqd = subtotal.times(rate).plus(landedIqd);
    const id = randomUUID();
    const entry = await this.ledger.post(tx, {
      sourceType: 'purchase_invoice',
      sourceId: id,
      event: 'post',
      documentDate: dates.documentDate,
      accountingDate: dates.accountingDate,
      createdBy: actorId,
      description: `Purchase from ${supplier.name}`,
      lines: [
        this.line(
          '1000',
          'debit',
          totalIqd,
          input.currency_code,
          totalCurrency,
          rate,
        ),
        this.line(
          '2000',
          'credit',
          totalIqd,
          input.currency_code,
          totalCurrency,
          rate,
        ),
      ],
    });
    const documentNumber = await this.numbers.issue(
      tx,
      'purchase_invoice',
      'PUR',
      dates.documentDate,
    );
    const invoice = await tx.purchaseInvoice.create({
      data: {
        id,
        document_number: documentNumber,
        operation_id: input.operation_id,
        supplier_id: supplier.id,
        invoice_number: input.supplier_invoice_number?.trim() || null,
        currency_code: input.currency_code,
        exchange_rate: rate,
        subtotal_currency: subtotal,
        landed_cost_currency: landedInvoiceCurrency,
        total_cost: totalCurrency,
        total_iqd: totalIqd,
        allocation_method: input.allocation_method,
        default_location_id: input.default_location_id,
        document_date: dates.documentDate,
        accounting_date: dates.accountingDate,
        due_date:
          date(input.due_date) ??
          new Date(
            dates.documentDate.getTime() +
              supplier.payment_terms_days * 86_400_000,
          ),
        notes: input.notes?.trim() || null,
        backdate_reason: dates.backdateReason,
        created_by: actorId,
        journal_entry_id: entry.id,
      },
    });
    for (const cost of landed) {
      await tx.purchaseLandedCost.create({
        data: {
          invoice_id: id,
          kind: cost.kind,
          description: cost.description,
          amount_currency: cost.amountCurrency,
          amount_iqd: cost.amountIqd,
          currency_code: cost.currencyCode,
        },
      });
    }
    for (const line of prepared) {
      const itemId = randomUUID();
      const item = await tx.purchaseInvoiceItem.create({
        data: {
          id: itemId,
          invoice_id: id,
          product_id: (line.variant as { product_id: string }).product_id,
          variant_id: (line.variant as { id: string }).id,
          location_id: line.locationId,
          purchase_quantity: line.purchaseQuantity,
          pack_size: line.packSize,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          base_unit_cost_currency: line.baseUnitCostCurrency,
          line_total_currency: line.lineTotalCurrency,
          landed_cost_share_iqd: line.landedShareIqd,
          landed_unit_cost_iqd: line.landedUnitIqd,
          currency_code: input.currency_code,
          lot_number: line.source.lot_number?.trim() || null,
          expiry_date: date(line.source.expiry_date),
        },
      });
      const lot = await tx.inventoryBatch.create({
        data: {
          product_id: item.product_id,
          variant_id: item.variant_id,
          supplier_id: supplier.id,
          po_item_id: item.id,
          lot_number: item.lot_number,
          expiry_date: item.expiry_date,
          purchase_cost: line.landedUnitIqd,
          currency_code: 'IQD',
          qty_received: line.quantity,
          landed_cost_share: line.landedShareIqd,
          source_type: 'purchase_invoice',
          source_id: id,
        },
      });
      await tx.purchaseInvoiceItem.update({
        where: { id: item.id },
        data: { lot_id: lot.id },
      });
      await tx.batchStock.create({
        data: {
          batch_id: lot.id,
          location_id: line.locationId,
          quantity: line.quantity,
        },
      });
      await tx.stockMovement.create({
        data: {
          batch_id: lot.id,
          type: 'receive',
          to_location: line.locationId,
          quantity: line.quantity,
          unit_cost_iqd: line.landedUnitIqd,
          reference: documentNumber,
          source_type: 'purchase_invoice',
          source_id: id,
          user_id: actorId,
        },
      });
      await this.changeSkuValue(
        tx,
        item.variant_id,
        line.quantity,
        line.quantity.times(line.landedUnitIqd),
        line.landedUnitIqd,
      );
    }
    await tx.supplierAccountEntry.create({
      data: {
        supplier_id: supplier.id,
        source_type: 'purchase_invoice',
        source_id: id,
        purchase_invoice_id: id,
        document_number: documentNumber,
        document_date: dates.documentDate,
        accounting_date: dates.accountingDate,
        due_date: invoice.due_date,
        currency_code: input.currency_code,
        credit_currency: totalCurrency,
        credit_iqd: totalIqd,
      },
    });
    await tx.documentDraft.deleteMany({
      where: { user_id: actorId, document_type: 'purchase_invoice' },
    });
    return this.invoiceTx(tx, id, permissions.includes('cost.view'));
  }

  async invoices(query: PurchasingQueryDto, canViewCost: boolean) {
    const page = query.page ?? 1;
    const perPage = query.per_page ?? 20;
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...(query.supplier_id ? { supplier_id: query.supplier_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.currency ? { currency_code: query.currency } : {}),
      ...(query.from || query.to
        ? {
            document_date: {
              ...(query.from ? { gte: date(query.from) } : {}),
              ...(query.to ? { lte: date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.purchaseInvoice.findMany({
        where,
        include: {
          supplier: true,
          payment_allocations: true,
          credit_allocations: true,
          return_documents: true,
        },
        orderBy: [{ document_date: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.purchaseInvoice.count({ where }),
    ]);
    return {
      page,
      per_page: perPage,
      total,
      data: rows.map((row) => this.presentInvoice(row, canViewCost)),
    };
  }

  async invoice(id: string, canViewCost: boolean) {
    return this.invoiceTx(this.prisma, id, canViewCost);
  }

  async payment(
    actorId: string,
    permissions: string[],
    input: CreateSupplierPaymentDto,
  ) {
    if (!input.allocations.length && D(input.amount).lte(0))
      throw new UnprocessableEntityException('Payment amount must be positive');
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/supplier-payments',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        await this.requireActiveSupplier(tx, input.supplier_id);
        const cash = await tx.cashAccount.findUnique({
          where: { id: input.cash_account_id },
        });
        if (!cash?.is_active)
          throw new ConflictException('Cash account is inactive');
        if (cash.currency_code !== input.currency_code)
          throw new UnprocessableEntityException(
            'Payment currency must match the cash account',
          );
        const amount = this.positive(input.amount, 'amount');
        const defaultRate = await this.currencies.requireRate(
          input.currency_code,
          dates.documentDate,
        );
        const settlementRate = input.exchange_rate
          ? this.positive(input.exchange_rate, 'exchange_rate')
          : defaultRate;
        const cashRate = input.currency_code === 'IQD' ? D(1) : settlementRate;
        const amountIqd = amount.times(cashRate);
        let allocatedCashIqd = D(0);
        let carryingIqd = D(0);
        let allocatedSupplierCurrency = D(0);
        const allocations = [] as Array<{
          invoice: Awaited<
            ReturnType<Tx['purchaseInvoice']['findUniqueOrThrow']>
          >;
          amount: Prisma.Decimal;
          carrying: Prisma.Decimal;
          paid: Prisma.Decimal;
          fx: Prisma.Decimal;
        }>;
        for (const source of input.allocations) {
          const invoice = await tx.purchaseInvoice.findUnique({
            where: { id: source.invoice_id },
          });
          if (!invoice || invoice.supplier_id !== input.supplier_id)
            throw new NotFoundException('Supplier invoice not found');
          assertDifferentActor(
            actorId,
            invoice.created_by,
            'A purchase creator cannot approve its supplier payment',
          );
          const applied = this.positive(source.amount, 'allocation.amount');
          const used = await tx.supplierPaymentAllocation.aggregate({
            where: { invoice_id: invoice.id },
            _sum: { amount_invoice_currency: true },
          });
          const remaining = invoice.total_cost.minus(
            used._sum.amount_invoice_currency ?? 0,
          );
          if (applied.gt(remaining))
            throw new ConflictException(
              'Allocation exceeds the invoice balance',
            );
          const carrying = applied.times(invoice.exchange_rate);
          const paid =
            invoice.currency_code === 'IQD'
              ? applied
              : applied.times(settlementRate);
          allocatedCashIqd = allocatedCashIqd.plus(paid);
          carryingIqd = carryingIqd.plus(carrying);
          if (invoice.currency_code === input.currency_code)
            allocatedSupplierCurrency = allocatedSupplierCurrency.plus(applied);
          allocations.push({
            invoice: invoice,
            amount: applied,
            carrying,
            paid,
            fx: paid.minus(carrying),
          });
        }
        if (allocatedCashIqd.gt(amountIqd))
          throw new ConflictException('Allocations exceed the payment amount');
        const unallocatedIqd = amountIqd.minus(allocatedCashIqd);
        const unallocatedCurrency = unallocatedIqd.div(cashRate);
        const fx = allocatedCashIqd.minus(carryingIqd);
        const id = randomUUID();
        const lines: PostingLine[] = [
          this.line(
            '2000',
            'debit',
            carryingIqd.plus(unallocatedIqd),
            'IQD',
            carryingIqd.plus(unallocatedIqd),
            D(1),
          ),
          this.line(
            cash.ledger_account_id
              ? await this.accountCode(tx, cash.ledger_account_id)
              : '1050',
            'credit',
            amountIqd,
            input.currency_code,
            amount,
            cashRate,
          ),
        ];
        if (fx.gt(0))
          lines.push(this.line('5030', 'debit', fx, 'IQD', fx, D(1)));
        if (fx.lt(0))
          lines.push(
            this.line('4020', 'credit', fx.abs(), 'IQD', fx.abs(), D(1)),
          );
        const entry = await this.ledger.post(tx, {
          sourceType: 'supplier_payment',
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: 'Supplier payment',
          lines,
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'supplier_payment',
          'SUP-PAY',
          dates.documentDate,
        );
        const payment = await tx.supplierPayment.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            supplier_id: input.supplier_id,
            cash_account_id: cash.id,
            currency_code: input.currency_code,
            amount_currency: amount,
            exchange_rate: cashRate,
            amount_iqd: amountIqd,
            allocated_currency: allocatedSupplierCurrency,
            unallocated_currency: unallocatedCurrency,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            reference: input.reference?.trim() || null,
            notes: input.notes?.trim() || null,
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        for (const allocation of allocations) {
          const created = await tx.supplierPaymentAllocation.create({
            data: {
              payment_id: id,
              invoice_id: (allocation.invoice as { id: string }).id,
              amount_invoice_currency: allocation.amount,
              invoice_carrying_iqd: allocation.carrying,
              payment_iqd: allocation.paid,
              fx_difference_iqd: allocation.fx,
            },
          });
          await tx.supplierAccountEntry.create({
            data: {
              supplier_id: input.supplier_id,
              source_type: 'payment_allocation',
              source_id: created.id,
              payment_id: id,
              document_number: documentNumber,
              document_date: dates.documentDate,
              accounting_date: dates.accountingDate,
              currency_code: (allocation.invoice as { currency_code: string })
                .currency_code,
              debit_currency: allocation.amount,
              debit_iqd: allocation.carrying,
            },
          });
        }
        if (unallocatedIqd.gt(0)) {
          const credit = await tx.supplierCredit.create({
            data: {
              supplier_id: input.supplier_id,
              source_type: 'payment',
              source_id: id,
              currency_code: input.currency_code,
              amount_currency: unallocatedCurrency,
              remaining_currency: unallocatedCurrency,
              amount_iqd: unallocatedIqd,
              payment_id: id,
            },
          });
          await tx.supplierAccountEntry.create({
            data: {
              supplier_id: input.supplier_id,
              source_type: 'payment_credit',
              source_id: credit.id,
              payment_id: id,
              credit_id: credit.id,
              document_number: documentNumber,
              document_date: dates.documentDate,
              accounting_date: dates.accountingDate,
              currency_code: input.currency_code,
              debit_currency: unallocatedCurrency,
              debit_iqd: unallocatedIqd,
            },
          });
        }
        return tx.supplierPayment.findUniqueOrThrow({
          where: { id: payment.id },
          include: { allocations: true, credits: true, journal_entry: true },
        });
      },
    });
  }

  async supplierReturn(
    actorId: string,
    permissions: string[],
    input: CreateSupplierReturnDto,
  ) {
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one return line is required',
      );
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/supplier-returns',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const supplier = await this.requireActiveSupplier(
          tx,
          input.supplier_id,
        );
        let totalIqd = D(0);
        const prepared = [] as Array<{
          source: CreateSupplierReturnDto['lines'][number];
          item: Awaited<
            ReturnType<Tx['purchaseInvoiceItem']['findUniqueOrThrow']>
          >;
          batch: Awaited<ReturnType<Tx['inventoryBatch']['findUniqueOrThrow']>>;
          quantity: Prisma.Decimal;
          amount: Prisma.Decimal;
        }>;
        let currency = supplier.default_currency;
        let rate = D(1);
        let returnTermsSet = false;
        for (const source of input.lines) {
          const item = await tx.purchaseInvoiceItem.findUnique({
            where: { id: source.purchase_item_id },
            include: { invoice: true },
          });
          const batch = await tx.inventoryBatch.findUnique({
            where: { id: source.batch_id },
          });
          if (
            !item ||
            !batch ||
            batch.id !== item.lot_id ||
            item.invoice.supplier_id !== supplier.id
          )
            throw new NotFoundException('Purchased lot not found');
          assertDifferentActor(
            actorId,
            item.invoice.created_by,
            'A purchase creator cannot approve its supplier return',
          );
          if (input.invoice_id && item.invoice_id !== input.invoice_id)
            throw new ConflictException(
              'Return line belongs to another invoice',
            );
          if (
            returnTermsSet &&
            (item.invoice.currency_code !== currency ||
              !item.invoice.exchange_rate.equals(rate))
          )
            throw new ConflictException(
              'Return lines must use the same currency and exchange rate',
            );
          const balance = await tx.batchStock.findUnique({
            where: {
              batch_id_location_id: {
                batch_id: batch.id,
                location_id: source.location_id,
              },
            },
          });
          const quantity = this.positive(source.quantity, 'quantity');
          if (!balance || quantity.gt(balance.quantity.minus(balance.reserved)))
            throw new ConflictException(
              'Return exceeds unreserved on-hand quantity',
            );
          const amount = quantity.times(batch.purchase_cost);
          totalIqd = totalIqd.plus(amount);
          currency = item.invoice.currency_code;
          rate = item.invoice.exchange_rate;
          returnTermsSet = true;
          prepared.push({
            source,
            item: item,
            batch: batch,
            quantity,
            amount,
          });
        }
        const totalCurrency = totalIqd.div(rate);
        const id = randomUUID();
        const entry = await this.ledger.post(tx, {
          sourceType: 'supplier_return',
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: input.reason,
          lines: [
            this.line('2000', 'debit', totalIqd, currency, totalCurrency, rate),
            this.line('1000', 'credit', totalIqd, 'IQD', totalIqd, D(1)),
          ],
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'supplier_return',
          'SUP-RET',
          dates.documentDate,
        );
        const document = await tx.supplierReturn.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            supplier_id: supplier.id,
            invoice_id: input.invoice_id,
            currency_code: currency,
            exchange_rate: rate,
            total_currency: totalCurrency,
            total_iqd: totalIqd,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            reason: input.reason.trim(),
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        for (const row of prepared) {
          await tx.batchStock.update({
            where: {
              batch_id_location_id: {
                batch_id: (row.batch as { id: string }).id,
                location_id: row.source.location_id,
              },
            },
            data: { quantity: { decrement: row.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              batch_id: (row.batch as { id: string }).id,
              type: 'return_to_supplier',
              from_location: row.source.location_id,
              quantity: row.quantity,
              unit_cost_iqd: (row.batch as { purchase_cost: Prisma.Decimal })
                .purchase_cost,
              reference: documentNumber,
              source_type: 'supplier_return',
              source_id: id,
              user_id: actorId,
            },
          });
          await tx.supplierReturnLine.create({
            data: {
              return_id: id,
              purchase_item_id: (row.item as { id: string }).id,
              batch_id: (row.batch as { id: string }).id,
              location_id: row.source.location_id,
              quantity: row.quantity,
              unit_cost_iqd: (row.batch as { purchase_cost: Prisma.Decimal })
                .purchase_cost,
              amount_iqd: row.amount,
            },
          });
          await this.changeSkuValue(
            tx,
            (row.batch as { variant_id: string }).variant_id,
            row.quantity.negated(),
            row.amount.negated(),
          );
        }
        await tx.supplierAccountEntry.create({
          data: {
            supplier_id: supplier.id,
            source_type: 'supplier_return',
            source_id: id,
            return_id: id,
            document_number: documentNumber,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            currency_code: currency,
            debit_currency: totalCurrency,
            debit_iqd: totalIqd,
          },
        });
        const openBalance = await this.balanceFor(tx, supplier.id, currency);
        if (openBalance.lt(0)) {
          const creditAmount = openBalance.abs();
          await tx.supplierCredit.create({
            data: {
              supplier_id: supplier.id,
              source_type: 'return',
              source_id: id,
              currency_code: currency,
              amount_currency: creditAmount,
              remaining_currency: creditAmount,
              amount_iqd: creditAmount.times(rate),
              return_id: id,
            },
          });
        }
        return tx.supplierReturn.findUniqueOrThrow({
          where: { id: document.id },
          include: { lines: true, credits: true, journal_entry: true },
        });
      },
    });
  }

  async correctCost(
    actorId: string,
    permissions: string[],
    input: CreateCostCorrectionDto,
  ) {
    if (!input.lines.length)
      throw new UnprocessableEntityException(
        'At least one correction line is required',
      );
    const dates = await this.dates.validate({
      documentDate: input.document_date,
      accountingDate: input.accounting_date,
      backdateReason: input.backdate_reason,
      permissions,
    });
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: 'POST /admin/purchase-cost-corrections',
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const invoice = await tx.purchaseInvoice.findUnique({
          where: { id: input.invoice_id },
        });
        if (!invoice) throw new NotFoundException('Purchase invoice not found');
        assertDifferentActor(
          actorId,
          invoice.created_by,
          'A purchase creator cannot approve its cost correction',
        );
        const supplierId = input.supplier_id ?? invoice.supplier_id;
        await this.requireActiveSupplier(tx, supplierId);
        let inventoryIqd = D(0);
        let custodyIqd = D(0);
        let cogsIqd = D(0);
        const prepared = [] as Array<Record<string, unknown>>;
        for (const source of input.lines) {
          const item = await tx.purchaseInvoiceItem.findUnique({
            where: { id: source.purchase_item_id },
            include: {
              lot: { include: { batch_stock: true, custody_holdings: true } },
              return_lines: true,
            },
          });
          if (!item?.lot || item.invoice_id !== invoice.id)
            throw new NotFoundException('Purchase line not found');
          const difference = D(source.unit_difference_iqd);
          if (difference.isZero())
            throw new UnprocessableEntityException(
              'Cost difference cannot be zero',
            );
          if (input.kind === 'late_landed_cost' && difference.lt(0))
            throw new UnprocessableEntityException(
              'A late landed cost must be positive',
            );
          const warehouseQty = item.lot.batch_stock.reduce(
            (sum, row) => sum.plus(row.quantity),
            D(0),
          );
          const custodyQty = item.lot.custody_holdings
            .filter((row) => row.status === 'in_custody')
            .reduce((sum, row) => sum.plus(row.quantity), D(0));
          const returnedQty = item.return_lines.reduce(
            (sum, row) => sum.plus(row.quantity),
            D(0),
          );
          const soldQty = item.quantity
            .minus(warehouseQty)
            .minus(custodyQty)
            .minus(returnedQty);
          if (soldQty.lt(0))
            throw new ConflictException('Lot quantity history is inconsistent');
          const inventory = warehouseQty.times(difference);
          const custody = custodyQty.times(difference);
          const cogs = soldQty.times(difference);
          inventoryIqd = inventoryIqd.plus(inventory);
          custodyIqd = custodyIqd.plus(custody);
          cogsIqd = cogsIqd.plus(cogs);
          prepared.push({
            source,
            item,
            difference,
            warehouseQty,
            custodyQty,
            soldQty,
            inventory,
            custody,
            cogs,
          });
        }
        const total = inventoryIqd.plus(custodyIqd).plus(cogsIqd);
        if (total.isZero())
          throw new UnprocessableEntityException(
            'Correction has no value effect',
          );
        const id = randomUUID();
        const lines = this.correctionPosting(
          total,
          inventoryIqd,
          custodyIqd,
          cogsIqd,
        );
        const entry = await this.ledger.post(tx, {
          sourceType: input.kind,
          sourceId: id,
          event: 'post',
          documentDate: dates.documentDate,
          accountingDate: dates.accountingDate,
          createdBy: actorId,
          description: input.reason,
          lines,
        });
        const documentNumber = await this.numbers.issue(
          tx,
          'purchase_cost_correction',
          input.kind === 'late_landed_cost' ? 'LAND' : 'COST',
          dates.documentDate,
        );
        const correction = await tx.purchaseCostCorrection.create({
          data: {
            id,
            document_number: documentNumber,
            operation_id: input.operation_id,
            invoice_id: invoice.id,
            supplier_id: supplierId,
            kind: input.kind,
            allocation_method: input.allocation_method,
            amount_iqd: total,
            inventory_iqd: inventoryIqd,
            custody_iqd: custodyIqd,
            cogs_iqd: cogsIqd,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            reason: input.reason.trim(),
            created_by: actorId,
            journal_entry_id: entry.id,
          },
        });
        for (const row of prepared) {
          const item = row.item as {
            id: string;
            lot_id: string;
            variant_id: string;
            lot: {
              purchase_cost: Prisma.Decimal;
              custody_holdings: Array<{
                id: string;
                status: string;
                unit_cost_iqd: Prisma.Decimal;
              }>;
            };
          };
          const difference = row.difference as Prisma.Decimal;
          await tx.purchaseCostCorrectionLine.create({
            data: {
              correction_id: id,
              purchase_item_id: item.id,
              unit_difference_iqd: difference,
              warehouse_quantity: row.warehouseQty as Prisma.Decimal,
              custody_quantity: row.custodyQty as Prisma.Decimal,
              sold_quantity: row.soldQty as Prisma.Decimal,
              inventory_iqd: row.inventory as Prisma.Decimal,
              custody_iqd: row.custody as Prisma.Decimal,
              cogs_iqd: row.cogs as Prisma.Decimal,
            },
          });
          await tx.inventoryBatch.update({
            where: { id: item.lot_id },
            data: { purchase_cost: { increment: difference } },
          });
          for (const holding of item.lot.custody_holdings.filter(
            (value) => value.status === 'in_custody',
          )) {
            await tx.custodyHolding.update({
              where: { id: holding.id },
              data: { unit_cost_iqd: { increment: difference } },
            });
          }
          await this.changeSkuValue(
            tx,
            item.variant_id,
            D(0),
            row.inventory as Prisma.Decimal,
          );
        }
        const currencyAmount = total.abs().div(invoice.exchange_rate);
        await tx.supplierAccountEntry.create({
          data: {
            supplier_id: supplierId,
            source_type: input.kind,
            source_id: id,
            document_number: documentNumber,
            document_date: dates.documentDate,
            accounting_date: dates.accountingDate,
            due_date: invoice.due_date,
            currency_code: invoice.currency_code,
            ...(total.gt(0)
              ? { credit_currency: currencyAmount, credit_iqd: total }
              : { debit_currency: currencyAmount, debit_iqd: total.abs() }),
          },
        });
        return tx.purchaseCostCorrection.findUniqueOrThrow({
          where: { id: correction.id },
          include: { lines: true, journal_entry: true },
        });
      },
    });
  }

  async statement(supplierId: string, query: StatementQueryDto) {
    await this.supplier(supplierId);
    const rows = await this.prisma.supplierAccountEntry.findMany({
      where: {
        supplier_id: supplierId,
        ...(query.currency ? { currency_code: query.currency } : {}),
        ...(query.as_of ? { document_date: { lte: date(query.as_of) } } : {}),
      },
      orderBy: [{ document_date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });
    const balances = new Map<
      string,
      { currency: Prisma.Decimal; iqd: Prisma.Decimal }
    >();
    return rows.map((row) => {
      const running = balances.get(row.currency_code) ?? {
        currency: D(0),
        iqd: D(0),
      };
      running.currency = running.currency
        .plus(row.credit_currency)
        .minus(row.debit_currency);
      running.iqd = running.iqd.plus(row.credit_iqd).minus(row.debit_iqd);
      balances.set(row.currency_code, running);
      return {
        ...row,
        running_balance_currency: running.currency,
        running_balance_iqd: running.iqd,
      };
    });
  }

  async balances() {
    const rows = await this.prisma.supplierAccountEntry.groupBy({
      by: ['supplier_id', 'currency_code'],
      _sum: {
        debit_currency: true,
        credit_currency: true,
        debit_iqd: true,
        credit_iqd: true,
      },
    });
    const suppliers = new Map(
      (await this.prisma.supplier.findMany()).map((row) => [row.id, row]),
    );
    return rows.map((row) => ({
      supplier: suppliers.get(row.supplier_id),
      currency_code: row.currency_code,
      balance_currency: D(row._sum.credit_currency ?? 0).minus(
        row._sum.debit_currency ?? 0,
      ),
      balance_iqd: D(row._sum.credit_iqd ?? 0).minus(row._sum.debit_iqd ?? 0),
    }));
  }

  async aging(asOf?: string) {
    const today =
      date(asOf) ?? new Date(`${await this.dates.today()}T00:00:00.000Z`);
    const invoices = await this.prisma.purchaseInvoice.findMany({
      include: {
        supplier: true,
        payment_allocations: true,
        credit_allocations: true,
        return_documents: true,
      },
      orderBy: [{ due_date: 'asc' }, { id: 'asc' }],
    });
    return invoices.flatMap((invoice) => {
      const applied = invoice.payment_allocations.reduce(
        (sum, row) => sum.plus(row.amount_invoice_currency),
        D(0),
      );
      const credits = invoice.credit_allocations.reduce(
        (sum, row) => sum.plus(row.amount_invoice_currency),
        D(0),
      );
      const returned = invoice.return_documents.reduce(
        (sum, row) => sum.plus(row.total_currency),
        D(0),
      );
      const remaining = invoice.total_cost
        .minus(applied)
        .minus(credits)
        .minus(returned);
      if (!remaining.gt(0)) return [];
      const days = invoice.due_date
        ? Math.max(
            0,
            Math.floor(
              (today.getTime() - invoice.due_date.getTime()) / 86_400_000,
            ),
          )
        : null;
      const bucket =
        days === null
          ? 'no_due_date'
          : days === 0
            ? 'current'
            : days <= 30
              ? '1_30'
              : days <= 60
                ? '31_60'
                : days <= 90
                  ? '61_90'
                  : '90_plus';
      return [
        {
          supplier: invoice.supplier,
          invoice_id: invoice.id,
          document_number: invoice.document_number,
          due_date: invoice.due_date,
          currency_code: invoice.currency_code,
          remaining,
          remaining_iqd: remaining.times(invoice.exchange_rate),
          bucket,
        },
      ];
    });
  }

  payments(query: PurchasingQueryDto) {
    return this.prisma.supplierPayment.findMany({
      where: query.supplier_id ? { supplier_id: query.supplier_id } : undefined,
      include: { supplier: true, allocations: true, credits: true },
      orderBy: [{ document_date: 'desc' }, { id: 'desc' }],
      take: query.per_page ?? 50,
      skip: ((query.page ?? 1) - 1) * (query.per_page ?? 50),
    });
  }

  credits(query: PurchasingQueryDto) {
    return this.prisma.supplierCredit.findMany({
      where: query.supplier_id ? { supplier_id: query.supplier_id } : undefined,
      include: { supplier: true },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: query.per_page ?? 50,
      skip: ((query.page ?? 1) - 1) * (query.per_page ?? 50),
    });
  }

  async allocateCredit(
    actorId: string,
    creditId: string,
    input: AllocateSupplierCreditDto,
  ) {
    return this.operations.execute({
      userId: actorId,
      operationId: input.operation_id,
      endpoint: `POST /admin/supplier-credits/${creditId}/allocations`,
      payload: input,
      responseStatus: 201,
      work: async (tx) => {
        const [credit, invoice] = await Promise.all([
          tx.supplierCredit.findUnique({ where: { id: creditId } }),
          tx.purchaseInvoice.findUnique({
            where: { id: input.invoice_id },
            include: {
              payment_allocations: true,
              credit_allocations: true,
              return_documents: true,
            },
          }),
        ]);
        if (!credit || !invoice || credit.supplier_id !== invoice.supplier_id)
          throw new NotFoundException('Supplier credit or invoice not found');
        assertDifferentActor(
          actorId,
          invoice.created_by,
          'A purchase creator cannot approve its credit allocation',
        );
        const invoiceAmount = this.positive(input.amount, 'amount');
        const alreadySettled = invoice.payment_allocations
          .reduce((sum, row) => sum.plus(row.amount_invoice_currency), D(0))
          .plus(
            invoice.credit_allocations.reduce(
              (sum, row) => sum.plus(row.amount_invoice_currency),
              D(0),
            ),
          )
          .plus(
            invoice.return_documents.reduce(
              (sum, row) => sum.plus(row.total_currency),
              D(0),
            ),
          );
        if (invoiceAmount.gt(invoice.total_cost.minus(alreadySettled)))
          throw new ConflictException(
            'Credit allocation exceeds the invoice balance',
          );
        const amountIqd = invoiceAmount.times(invoice.exchange_rate);
        const creditRate = credit.amount_iqd.div(credit.amount_currency);
        const creditAmount = amountIqd.div(creditRate);
        if (creditAmount.gt(credit.remaining_currency))
          throw new ConflictException(
            'Credit allocation exceeds the remaining credit',
          );
        const allocation = await tx.supplierCreditAllocation.create({
          data: {
            credit_id: credit.id,
            invoice_id: invoice.id,
            amount_invoice_currency: invoiceAmount,
            amount_credit_currency: creditAmount,
            amount_iqd: amountIqd,
          },
        });
        await tx.supplierCredit.update({
          where: { id: credit.id },
          data: { remaining_currency: { decrement: creditAmount } },
        });
        return allocation;
      },
    });
  }

  private allocateLanded(
    lines: Array<{
      quantity: Prisma.Decimal;
      lineTotalCurrency: Prisma.Decimal;
      source: { manual_landed_cost_iqd?: string };
      landedShareIqd: Prisma.Decimal;
      landedUnitIqd: Prisma.Decimal;
      baseUnitCostCurrency: Prisma.Decimal;
    }>,
    total: Prisma.Decimal,
    method: 'value' | 'quantity' | 'manual',
    exchangeRate: Prisma.Decimal,
  ) {
    if (total.isZero()) {
      for (const line of lines)
        line.landedUnitIqd = line.baseUnitCostCurrency.times(exchangeRate);
      return;
    }
    if (method === 'manual') {
      const manualTotal = lines.reduce(
        (sum, line) => sum.plus(line.source.manual_landed_cost_iqd ?? 0),
        D(0),
      );
      if (!manualTotal.equals(total))
        throw new UnprocessableEntityException(
          'Manual landed-cost shares must sum exactly to the landed costs',
        );
      lines.forEach(
        (line) =>
          (line.landedShareIqd = D(line.source.manual_landed_cost_iqd ?? 0)),
      );
    } else {
      const denominator = lines.reduce(
        (sum, line) =>
          sum.plus(method === 'value' ? line.lineTotalCurrency : line.quantity),
        D(0),
      );
      if (!denominator.gt(0))
        throw new UnprocessableEntityException(
          'Landed costs cannot be allocated across zero lines',
        );
      let assigned = D(0);
      lines.forEach((line, index) => {
        const weight =
          method === 'value' ? line.lineTotalCurrency : line.quantity;
        line.landedShareIqd =
          index === lines.length - 1
            ? total.minus(assigned)
            : total
                .times(weight)
                .div(denominator)
                .toDecimalPlaces(12, Prisma.Decimal.ROUND_HALF_UP);
        assigned = assigned.plus(line.landedShareIqd);
      });
    }
    for (const line of lines)
      line.landedUnitIqd = line.baseUnitCostCurrency
        .times(exchangeRate)
        .plus(line.landedShareIqd.div(line.quantity));
  }

  private async transactionRate(
    currency: string,
    at: Date,
    supplied: string | undefined,
    permissions: string[],
  ) {
    const defaultRate = await this.currencies.requireRate(currency, at);
    if (!supplied) return defaultRate;
    const rate = this.positive(supplied, 'exchange_rate');
    if (currency === 'IQD' && !rate.equals(1))
      throw new UnprocessableEntityException('The IQD exchange rate must be 1');
    if (
      !rate.equals(defaultRate) &&
      !permissions.includes('purchases.override_rate')
    )
      throw new ForbiddenException(
        'Editing the purchase exchange rate requires purchases.override_rate',
      );
    return rate;
  }

  private async requireActiveSupplier(tx: Tx, id: string) {
    const supplier = await tx.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (!supplier.is_active)
      throw new ConflictException('Supplier is inactive');
    return supplier;
  }

  private positive(value: DecimalInput, field: string) {
    const decimal = D(value);
    if (!decimal.gt(0))
      throw new UnprocessableEntityException(`${field} must be positive`);
    return decimal;
  }

  private line(
    accountCode: string,
    side: 'debit' | 'credit',
    base: Prisma.Decimal,
    currency: string,
    original: Prisma.Decimal,
    rate: Prisma.Decimal,
  ): PostingLine {
    return {
      accountCode,
      side,
      baseAmount: base.abs().toFixed(4),
      currencyCode: currency,
      originalAmount: original.abs().toFixed(6),
      exchangeRate: rate.toFixed(10),
    };
  }

  private correctionPosting(
    total: Prisma.Decimal,
    inventory: Prisma.Decimal,
    custody: Prisma.Decimal,
    cogs: Prisma.Decimal,
  ) {
    const lines: PostingLine[] = [];
    for (const [account, amount] of [
      ['1000', inventory],
      ['1010', custody],
      ['5000', cogs],
    ] as const) {
      if (!amount.isZero())
        lines.push(
          this.line(
            account,
            amount.gt(0) ? 'debit' : 'credit',
            amount.abs(),
            'IQD',
            amount.abs(),
            D(1),
          ),
        );
    }
    lines.push(
      this.line(
        '2000',
        total.gt(0) ? 'credit' : 'debit',
        total.abs(),
        'IQD',
        total.abs(),
        D(1),
      ),
    );
    return lines;
  }

  private async changeSkuValue(
    tx: Tx,
    variantId: string,
    quantityDelta: Prisma.Decimal,
    valueDelta: Prisma.Decimal,
    lastLanded?: Prisma.Decimal,
  ) {
    await tx.skuCost.upsert({
      where: { variant_id: variantId },
      create: { variant_id: variantId },
      update: {},
    });
    await tx.$queryRaw`SELECT variant_id FROM sku_costs WHERE variant_id = ${variantId}::uuid FOR UPDATE`;
    const current = await tx.skuCost.findUniqueOrThrow({
      where: { variant_id: variantId },
    });
    const quantity = current.book_quantity.plus(quantityDelta);
    const value = current.book_value_iqd.plus(valueDelta);
    if (quantity.lt(0) || value.lt(0))
      throw new ConflictException(
        'Inventory cost balance would become negative',
      );
    await tx.skuCost.update({
      where: { variant_id: variantId },
      data: {
        book_quantity: quantity,
        book_value_iqd: value,
        average_cost_iqd: quantity.isZero() ? 0 : value.div(quantity),
        ...(lastLanded ? { last_landed_cost_iqd: lastLanded } : {}),
        updated_at: new Date(),
      },
    });
  }

  private async accountCode(tx: Tx, accountId: string) {
    return (
      await tx.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } })
    ).code;
  }

  private async balanceFor(tx: Tx, supplierId: string, currency: string) {
    const aggregate = await tx.supplierAccountEntry.aggregate({
      where: { supplier_id: supplierId, currency_code: currency },
      _sum: { debit_currency: true, credit_currency: true },
    });
    return D(aggregate._sum.credit_currency ?? 0).minus(
      aggregate._sum.debit_currency ?? 0,
    );
  }

  private async invoiceTx(
    tx: Tx | PrismaService,
    id: string,
    canViewCost: boolean,
  ) {
    const row = await tx.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        default_location: { include: { warehouse: true } },
        items: { include: { variant: true, location: true, lot: true } },
        landed_costs: true,
        payment_allocations: true,
        credit_allocations: true,
        return_documents: true,
        corrections: true,
        journal_entry: { select: { id: true, document_number: true } },
      },
    });
    if (!row) throw new NotFoundException('Purchase invoice not found');
    return this.presentInvoice(row, canViewCost);
  }

  private presentInvoice<T extends object>(
    row: T,
    canViewCost: boolean,
  ): T | Record<string, unknown> {
    const source = row as T & {
      total_cost?: Prisma.Decimal;
      payment_allocations?: Array<{ amount_invoice_currency: Prisma.Decimal }>;
      credit_allocations?: Array<{ amount_invoice_currency: Prisma.Decimal }>;
      return_documents?: Array<{ total_currency: Prisma.Decimal }>;
    };
    const settled = (source.payment_allocations ?? [])
      .reduce((sum, item) => sum.plus(item.amount_invoice_currency), D(0))
      .plus(
        (source.credit_allocations ?? []).reduce(
          (sum, item) => sum.plus(item.amount_invoice_currency),
          D(0),
        ),
      )
      .plus(
        (source.return_documents ?? []).reduce(
          (sum, item) => sum.plus(item.total_currency),
          D(0),
        ),
      );
    const result = {
      ...row,
      ...(source.total_cost
        ? {
            remaining_currency: Prisma.Decimal.max(
              D(0),
              source.total_cost.minus(settled),
            ),
            settlement_status: settled.isZero()
              ? 'open'
              : settled.gte(source.total_cost)
                ? 'paid'
                : 'partial',
          }
        : {}),
    } as Record<string, unknown>;
    if (canViewCost) return result;
    for (const key of [
      'exchange_rate',
      'subtotal_currency',
      'landed_cost_currency',
      'total_cost',
      'total_iqd',
      'landed_costs',
      'corrections',
    ])
      delete result[key];
    if (Array.isArray(result.items)) {
      result.items = result.items.map((item) => {
        const value = { ...(item as Record<string, unknown>) };
        for (const key of [
          'unit_cost',
          'base_unit_cost_currency',
          'line_total_currency',
          'landed_cost_share_iqd',
          'landed_unit_cost_iqd',
        ])
          delete value[key];
        if (value.lot && typeof value.lot === 'object') {
          value.lot = { ...value.lot };
          delete (value.lot as Record<string, unknown>).purchase_cost;
          delete (value.lot as Record<string, unknown>).landed_cost_share;
        }
        return value;
      });
    }
    return result;
  }
}
