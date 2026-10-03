jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { LinkedPricingService } from './linked-pricing.service';

const preview = {
  id: '00000000-0000-4000-8000-000000000001',
  actor_id: 'proposer',
  currency_code: 'USD',
  proposed_rate: new Prisma.Decimal(1500),
  effective_at: new Date('2026-10-03T11:00:00.000Z'),
  reason: 'Rate and linked-price proposal',
  fingerprint: 'fingerprint',
  expires_at: new Date('2099-01-01T00:00:00.000Z'),
  created_at: new Date('2026-10-03T11:00:00.000Z'),
};
const variant = {
  id: 'variant-1',
  sku: 'SKU-1',
  reference_price: new Prisma.Decimal(1),
  published_price: new Prisma.Decimal(2000),
  updated_at: new Date('2026-10-03T11:00:00.000Z'),
};
const breach = {
  variant_id: 'variant-1',
  sku: 'SKU-1',
  price: 1500,
  cost: 2000,
  threshold_percent: 100,
  minimum_price: 2000,
};

function setup() {
  const pending = {
    id: 'approval-1',
    preview_id: preview.id,
    price_version_id: null,
    status: 'pending',
    proposed_by: preview.actor_id,
    decided_by: null,
    proposal_reason: 'Clearance pricing',
    decision_reason: null,
    breaches: [breach],
    created_at: new Date(),
    decided_at: null,
  };
  const approved = {
    ...pending,
    preview_id: null,
    price_version_id: 'version-1',
    status: 'approved',
    decided_by: 'approver',
    decision_reason: 'Approved by finance',
    decided_at: new Date(),
  };
  const createApproval = jest
    .fn<
      Promise<typeof pending>,
      [
        input: {
          data: {
            preview_id: string;
            proposed_by: string;
            proposal_reason: string;
            breaches: (typeof breach)[];
          };
        },
      ]
    >()
    .mockResolvedValue(pending);
  const createVersion = jest
    .fn<
      Promise<{ id: string }>,
      [input: { data: { proposed_by: string; published_by: string } }]
    >()
    .mockResolvedValue({ id: 'version-1' });
  const updateApproval = jest
    .fn<
      Promise<typeof approved>,
      [
        input: {
          where: { id: string };
          data: { status: string; decided_by: string };
        },
      ]
    >()
    .mockResolvedValue(approved);
  const tx = {
    linkedPricePreview: {
      findUnique: jest.fn().mockResolvedValue(preview),
      delete: jest.fn().mockResolvedValue(preview),
    },
    pricePublishApproval: {
      findUnique: jest.fn().mockResolvedValue(pending),
      create: createApproval,
      update: updateApproval,
      updateMany: jest.fn(),
    },
    currency: {
      findFirst: jest.fn().mockResolvedValue({ display_precision: 0 }),
    },
    exchangeRate: {
      create: jest.fn().mockResolvedValue({
        id: 'rate-1',
        rate: new Prisma.Decimal(1500),
      }),
    },
    priceVersion: { create: createVersion },
    productVariant: { update: jest.fn().mockResolvedValue({}) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    ...tx,
    pricePublishApproval: {
      ...tx.pricePublishApproval,
      findUnique: jest.fn().mockResolvedValue(pending),
      findUniqueOrThrow: jest.fn().mockResolvedValue(approved),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const belowCost = { breaches: jest.fn().mockResolvedValue([breach]) };
  const service = new LinkedPricingService(
    prisma as never,
    audit,
    belowCost as never,
  );
  Object.assign(service, {
    fingerprint: jest.fn().mockResolvedValue({
      hash: preview.fingerprint,
      variants: [variant],
    }),
    rounding: jest.fn().mockResolvedValue(new Prisma.Decimal(0)),
  });
  return {
    service,
    prisma,
    tx,
    audit,
    pending,
    createApproval,
    createVersion,
    updateApproval,
  };
}

describe('linked below-cost publish approvals', () => {
  it('keeps a below-cost publish pending with the authenticated proposer', async () => {
    const { service, tx, audit } = setup();
    await expect(
      service.publish('proposer', {
        preview_token: preview.id,
        below_cost_override_reason: 'Clearance pricing',
      }),
    ).resolves.toEqual({
      mode: 'pending_approval',
      exchange_rate_id: null,
      price_version_id: null,
      approval_request_id: 'approval-1',
      linked_sku_count: 1,
    });
    expect(
      tx.pricePublishApproval.create.mock.calls[0][0].data.proposed_by,
    ).toBe('proposer');
    expect(tx.exchangeRate.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'proposer',
        action: 'prices.linked.approval_requested',
      }),
    );
  });

  it('refuses the proposer even if a different client id is attempted', async () => {
    const { service } = setup();
    await expect(
      service.decide('proposer', 'approval-1', {
        decision: 'approve',
        reason: 'Pretend another user proposed this',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('publishes when a second authenticated user approves', async () => {
    const { service, tx, audit } = setup();
    await expect(
      service.decide('approver', 'approval-1', {
        decision: 'approve',
        reason: 'Approved by finance',
      }),
    ).resolves.toMatchObject({
      id: 'approval-1',
      status: 'approved',
      decided_by: 'approver',
      price_version_id: 'version-1',
    });
    const version = tx.priceVersion.create.mock.calls[0][0].data;
    expect(version.proposed_by).toBe('proposer');
    expect(version.published_by).toBe('approver');
    const decision = tx.pricePublishApproval.update.mock.calls[0][0];
    expect(decision.where.id).toBe('approval-1');
    expect(decision.data.status).toBe('approved');
    expect(decision.data.decided_by).toBe('approver');
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actorId: 'approver',
        action: 'prices.linked.approval_approved',
      }),
    );
  });
});
