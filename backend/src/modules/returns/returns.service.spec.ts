jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../audit/audit.service', () => ({ AuditService: class {} }));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));
jest.mock('../inventory/inventory.service', () => ({
  InventoryService: class {},
}));
jest.mock('../finance/date-rules.service', () => ({
  DateRulesService: class {},
}));
jest.mock('../finance/document-number.service', () => ({
  DocumentNumberService: class {},
}));
jest.mock('../finance/ledger.service', () => ({ LedgerService: class {} }));
jest.mock('../finance/operation.service', () => ({
  OperationService: class {},
}));

import { ReturnsService } from './returns.service';

const now = new Date('2026-10-18T08:00:00Z');
const row = {
  id: '10000000-0000-4000-8000-000000000001',
  document_number: 'RET-1',
  order_id: '20000000-0000-4000-8000-000000000001',
  user_id: '30000000-0000-4000-8000-000000000001',
  created_by: '30000000-0000-4000-8000-000000000001',
  source: 'customer',
  type: 'return',
  status: 'requested',
  reason: null,
  expected_refund: 10,
  refund_amount: 0,
  delivery_fee_refund: 0,
  uncollected_offset: 0,
  cash_refund_amount: 0,
  points_earned_reversed: 0,
  points_redeemed_restored: 0,
  currency_code: 'IQD',
  document_date: now,
  accounting_date: now,
  reviewed_by: null,
  reviewed_at: null,
  completed_at: null,
  created_at: now,
  user: { name: 'Customer', phone: '+9647700000000' },
  order: {
    id: '20000000-0000-4000-8000-000000000001',
    order_number: 'ORD-1',
    total: 100,
    delivery_collection: {
      id: '40000000-0000-4000-8000-000000000001',
      status: 'confirmed_full',
      currency_code: 'IQD',
      collected_amount: 100,
      party: {
        id: '50000000-0000-4000-8000-000000000001',
        kind: 'external_driver',
        name: 'Driver',
      },
      cash_receipt_allocations: [{ amount_iqd: 20 }],
      trip_settlement_allocations: [{ amount_iqd: 10 }],
      return_refund_payments: [{ amount_iqd: 5 }],
    },
  },
  items: [
    {
      id: '60000000-0000-4000-8000-000000000001',
      order_item_id: '70000000-0000-4000-8000-000000000001',
      quantity: 1,
      approved_quantity: 0,
      customer_reason: 'Wrong item',
      reason_code: 'wrong_item',
      allocation_start_quantity: 0,
      unit_price: 10,
      discount_share: 0,
      net_amount: 10,
      approved_refund: 0,
      earned_points_share: 0,
      redeemed_points_share: 0,
      issue_cost_value: 7,
      currency_code: 'IQD',
      base_unit: 'piece',
      whole_units_only: true,
      condition: null,
      restock: false,
      batch_id: null,
      inspection_location: null,
      order_item: {
        variant_id: '80000000-0000-4000-8000-000000000001',
        product_name_ar: 'منتج',
        product_name_en: 'Product',
      },
    },
  ],
  refund: null,
  events: [
    {
      id: '90000000-0000-4000-8000-000000000001',
      type: 'requested',
      operation_id: 'return-request-1',
      document_date: now,
      accounting_date: now,
      actor_id: '30000000-0000-4000-8000-000000000001',
      note: null,
      created_at: now,
      actor: { name: 'Customer', username: null, role: { name: 'customer' } },
    },
  ],
  refund_payments: [],
  postings: [],
};

describe('ReturnsService staff projections', () => {
  const service = new ReturnsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('keeps cost and customer/custody fields out of the customer response', () => {
    const result = service['present'](row as never);
    expect(result).not.toHaveProperty('customer_phone');
    expect(result).not.toHaveProperty('delivery_collection');
    expect(result.items[0]).not.toHaveProperty('original_issue_cost');
    expect(result.events[0]).toEqual(
      expect.objectContaining({ actor_display_name: 'you', actor_role: null }),
    );
  });

  it('shows staff customer/custody context and cost only with cost.view', () => {
    const withoutCost = service['present'](row as never, {
      id: 'a0000000-0000-4000-8000-000000000001',
      permissions: ['returns.view'],
    });
    expect(withoutCost.customer_phone).toBe('+9647700000000');
    expect(withoutCost.delivery_collection?.held_amount).toBe(65);
    expect(withoutCost.items[0]).not.toHaveProperty('original_issue_cost');

    const withCost = service['present'](row as never, {
      id: 'a0000000-0000-4000-8000-000000000001',
      permissions: ['returns.view', 'cost.view'],
    });
    expect(withCost.items[0].original_issue_cost).toBe(7);
    expect(withCost.events[0]).toEqual(
      expect.objectContaining({
        actor_display_name: 'Customer',
        actor_role: 'customer',
      }),
    );
  });
});
