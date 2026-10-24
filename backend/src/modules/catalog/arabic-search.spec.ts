import { normalizeCatalogSearch } from './arabic-search';

describe('catalog Arabic search normalization', () => {
  it.each([
    ['  أَرز   عِراقي ', 'ارز عراقي'],
    ['إبريق', 'ابريق'],
    ['مقصّات', 'مقصات'],
    ['هدى', 'هدي'],
    ['علبة', 'علبه'],
    ['رؤية', 'رويه'],
  ])('normalizes %s without changing stored names', (input, expected) => {
    expect(normalizeCatalogSearch(input)).toBe(expected);
  });
});
