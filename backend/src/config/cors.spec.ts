import { DEFAULT_CORS_ORIGINS, parseCorsOrigins } from './cors';

describe('CORS origins', () => {
  it('allows both local browser ports by default', () => {
    expect(DEFAULT_CORS_ORIGINS).toBe(
      'http://localhost:3000,http://localhost:3100',
    );
    expect(parseCorsOrigins()).toEqual([
      'http://localhost:3000',
      'http://localhost:3100',
    ]);
  });

  it('parses a comma-separated override and ignores empty entries', () => {
    expect(
      parseCorsOrigins(' https://shop.example , ,https://admin.example  '),
    ).toEqual(['https://shop.example', 'https://admin.example']);
  });
});
