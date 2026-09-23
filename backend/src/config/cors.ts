export const DEFAULT_CORS_ORIGINS =
  'http://localhost:3000,http://localhost:3100';

export function parseCorsOrigins(
  value: string = DEFAULT_CORS_ORIGINS,
): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
