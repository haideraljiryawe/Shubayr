jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));

import { ACCESS_POLICY_KEY } from '../../common/decorators/access-policy.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import {
  DeliveriesController,
  DeliveryAgentsController,
} from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryStatus } from './dto/assigned-deliveries-query.dto';

type DeliveryRow = {
  id: string;
  agent_id: string;
  status: DeliveryStatus;
  dispatched_at: Date | null;
  order?: { version: number };
  order_version?: number;
};

describe('DeliveriesService', () => {
  const currentAgent = 'agent-current';
  const otherAgent = 'agent-other';
  const rows: DeliveryRow[] = [
    ...Array.from({ length: 45 }, (_, index) => ({
      id: `assigned-${String(index).padStart(2, '0')}`,
      agent_id: currentAgent,
      status: DeliveryStatus.Assigned,
      dispatched_at: new Date(Date.UTC(2026, 0, 1, 0, index)),
      order: { version: 1 },
    })),
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `delivered-${index}`,
      agent_id: currentAgent,
      status: DeliveryStatus.Delivered,
      dispatched_at: new Date(Date.UTC(2026, 0, 2, 0, index)),
      order: { version: 2 },
    })),
    ...Array.from({ length: 7 }, (_, index) => ({
      id: `other-agent-${index}`,
      agent_id: otherAgent,
      status: DeliveryStatus.Assigned,
      dispatched_at: new Date(Date.UTC(2026, 0, 3, 0, index)),
      order: { version: 1 },
    })),
  ];

  const matching = (where: { agent_id: string; status?: DeliveryStatus }) =>
    rows.filter(
      (row) =>
        row.agent_id === where.agent_id &&
        (!where.status || row.status === where.status),
    );

  const count = jest.fn(
    ({ where }: { where: { agent_id: string; status?: DeliveryStatus } }) =>
      Promise.resolve(matching(where).length),
  );
  const findMany = jest.fn(
    ({
      where,
      skip,
      take,
    }: {
      where: { agent_id: string; status?: DeliveryStatus };
      skip: number;
      take: number;
    }) =>
      Promise.resolve(
        matching(where)
          .sort((a, b) => {
            const dateDifference =
              (b.dispatched_at?.getTime() ?? 0) -
              (a.dispatched_at?.getTime() ?? 0);
            return dateDifference || b.id.localeCompare(a.id);
          })
          .slice(skip, skip + take),
      ),
  );
  const prisma = {
    delivery: { count, findMany },
    $transaction: jest.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    ),
  };
  const service = new DeliveriesService(
    prisma as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('filters the current agent before paginating and reports the filtered total', async () => {
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        service.listAssigned(currentAgent, {
          status: DeliveryStatus.Assigned,
          page,
          per_page: 20,
        }),
      ),
    );

    expect(pages.map(({ data }) => data.length)).toEqual([20, 20, 5]);
    expect(pages.map(({ total }) => total)).toEqual([45, 45, 45]);
    const deliveries = pages.flatMap(({ data }) => data as DeliveryRow[]);
    expect(new Set(deliveries.map(({ id }) => id))).toHaveProperty('size', 45);
    expect(
      deliveries.every(
        ({ agent_id, status }) =>
          agent_id === currentAgent && status === DeliveryStatus.Assigned,
      ),
    ).toBe(true);
    expect(deliveries.every(({ order_version }) => order_version === 1)).toBe(
      true,
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { agent_id: currentAgent, status: DeliveryStatus.Assigned },
        orderBy: [{ dispatched_at: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('returns all statuses for the current agent when status is omitted', async () => {
    const result = await service.listAssigned(currentAgent, {
      page: 1,
      per_page: 100,
    });

    expect(result.total).toBe(53);
    expect(result.data).toHaveLength(53);
    expect(result.data.every(({ agent_id }) => agent_id === currentAgent)).toBe(
      true,
    );
    expect(findMany.mock.calls.at(-1)?.[0].where).toEqual({
      agent_id: currentAgent,
    });
  });
});

describe('DeliveriesController', () => {
  it('requires the delivery-agent app role and uses the authenticated agent id', async () => {
    const listAssigned = jest.fn().mockResolvedValue({});
    const controller = new DeliveriesController({ listAssigned } as never);
    const user: AuthenticatedRequestUser = {
      id: 'current-agent',
      phone: '+9647700000005',
      username: null,
      role: 'delivery_agent',
      surface: 'app',
      client: 'mobile',
      permissions: [],
      permissionVersion: 1,
      sessionVersion: 1,
      mustChangePassword: false,
    };

    expect(
      // Decorator metadata is attached to the unbound controller method.
      Reflect.getMetadata(
        ACCESS_POLICY_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        DeliveriesController.prototype.listAssigned,
      ),
    ).toEqual({
      access: 'authenticated',
      surfaces: ['app'],
      appRoles: ['delivery_agent'],
    });
    await controller.listAssigned({ user } as never, {
      status: DeliveryStatus.Assigned,
      page: 1,
      per_page: 20,
    });
    expect(listAssigned.mock.calls).toEqual([
      [
        user.id,
        {
          status: DeliveryStatus.Assigned,
          page: 1,
          per_page: 20,
        },
      ],
    ]);
  });

  it('protects the delivery-agent picker with only orders.assign_agent', () => {
    expect(
      Reflect.getMetadata(
        ACCESS_POLICY_KEY,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        DeliveryAgentsController.prototype.list,
      ),
    ).toEqual({
      access: 'authenticated',
      surfaces: ['admin'],
      permissions: ['orders.assign_agent'],
    });
  });
});

describe('DeliveriesService delivery-agent picker', () => {
  it('searches active delivery work accounts before stable pagination', async () => {
    const rows = [
      {
        id: 'agent-1',
        name: 'Delivery A',
        phone: '+9647700000005',
        work_profile: { name: 'Courier A' },
      },
    ];
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue(rows),
      },
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    const service = new DeliveriesService(
      prisma as never,
      {} as never,
      {} as never,
    );

    const result = await service.listAgents({
      q: 'Courier',
      page: 2,
      per_page: 10,
    });

    expect(result).toEqual({
      page: 2,
      per_page: 10,
      total: 1,
      data: [{ id: 'agent-1', name: 'Courier A', phone: '+9647700000005' }],
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        is_active: true,
        role: { is: { name: 'delivery_agent' } },
        work_profile: {
          is: { app_role: 'delivery_agent', is_active: true },
        },
        OR: [
          { name: { contains: 'Courier', mode: 'insensitive' } },
          { phone: { contains: 'Courier' } },
          {
            work_profile: {
              is: {
                name: { contains: 'Courier', mode: 'insensitive' },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        work_profile: { select: { name: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
  });
});
