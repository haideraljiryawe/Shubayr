export const BUSINESS_TIME_ZONE = 'Asia/Baghdad';

/**
 * Return the current Shubayr business date as a UTC-midnight Date value.
 *
 * Prisma maps PostgreSQL DATE columns to Date, so UTC midnight is the stable
 * transport representation. The calendar fields, however, are always derived
 * in Baghdad rather than from the server's UTC calendar.
 */
export function businessDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`);
}
