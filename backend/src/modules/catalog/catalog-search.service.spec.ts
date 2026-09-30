import type { PrismaService } from '../../database/prisma.service';
import { CatalogSearchService } from './catalog-search.service';

jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

const mockUpdateFilterableAttributes = jest.fn();
const mockUpdateSearchableAttributes = jest.fn();
const mockUpdateSortableAttributes = jest.fn();
const mockAddDocuments = jest.fn();
const mockDeleteDocument = jest.fn();
const mockIndex = jest.fn(() => ({
  updateFilterableAttributes: mockUpdateFilterableAttributes,
  updateSearchableAttributes: mockUpdateSearchableAttributes,
  updateSortableAttributes: mockUpdateSortableAttributes,
  addDocuments: mockAddDocuments,
  deleteDocument: mockDeleteDocument,
}));

jest.mock('meilisearch', () => ({
  Meilisearch: jest.fn(() => ({ index: mockIndex })),
}));

describe('CatalogSearchService outage handling', () => {
  const product = {
    id: 'product-1',
    category_id: 'category-1',
    brand_id: null,
    brand: null,
    name_en: 'Product',
    name_ar: 'Product',
    description: null,
    status: 'hidden',
    published_at: null,
    price: 100,
    created_at: new Date('2026-09-30T00:00:00.000Z'),
    variants: [
      {
        sku: 'SKU-1',
        pricing_mode: 'fixed',
        published_price: null,
        selling_price: null,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateFilterableAttributes.mockResolvedValue(undefined);
    mockUpdateSearchableAttributes.mockResolvedValue(undefined);
    mockUpdateSortableAttributes.mockResolvedValue(undefined);
    mockAddDocuments.mockResolvedValue(undefined);
    mockDeleteDocument.mockResolvedValue(undefined);
  });

  it('drops the client when startup synchronization cannot reach search', async () => {
    mockUpdateFilterableAttributes.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED'),
    );
    const findUnique = jest.fn();
    const prisma = {
      product: { findMany: jest.fn(), findUnique },
    } as unknown as PrismaService;
    const service = new CatalogSearchService(prisma);

    await service.onModuleInit();
    await expect(service.indexProduct(product.id)).resolves.toBeUndefined();

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('does not fail a committed catalog write when indexing later fails', async () => {
    const prisma = {
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
    } as unknown as PrismaService;
    const service = new CatalogSearchService(prisma);
    Object.assign(service, { client: { index: mockIndex } });
    mockAddDocuments.mockRejectedValueOnce(new Error('search unavailable'));

    await expect(service.indexProduct(product.id)).resolves.toBeUndefined();
    await expect(service.indexProduct(product.id)).resolves.toBeUndefined();
    expect(mockAddDocuments).toHaveBeenCalledTimes(1);
  });
});
