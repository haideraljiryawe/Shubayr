export const BUSINESS_TIME_ZONE = 'Asia/Baghdad';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parts(value: Date) {
  const values = Object.fromEntries(
    businessDateFormatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return { year: values.year, month: values.month, day: values.day };
}

function dateParts(value: string | Date) {
  if (value instanceof Date) return parts(value);
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Business date must use YYYY-MM-DD');
  const result = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const checked = new Date(Date.UTC(result.year, result.month - 1, result.day));
  if (
    checked.getUTCFullYear() !== result.year ||
    checked.getUTCMonth() !== result.month - 1 ||
    checked.getUTCDate() !== result.day
  ) {
    throw new RangeError('Invalid business date');
  }
  return result;
}

function utcForBaghdadMidnight(value: string | Date): Date {
  const desired = dateParts(value);
  const represented = Date.UTC(desired.year, desired.month - 1, desired.day);
  let guess = represented;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const values = Object.fromEntries(
      businessDateTimeFormatter
        .formatToParts(new Date(guess))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    guess +=
      represented -
      Date.UTC(
        values.year,
        values.month - 1,
        values.day,
        values.hour,
        values.minute,
        values.second,
      );
  }
  return new Date(guess);
}

/** Format an instant or DATE-column transport value as a Baghdad calendar date. */
export function businessDateText(value = new Date()): string {
  const { year, month, day } = parts(value);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parse a calendar date into the UTC-midnight transport used by Prisma DATE fields. */
export function parseBusinessDate(value: string): Date {
  const { year, month, day } = dateParts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Return the instant at which a Baghdad calendar day begins. */
export function businessDayStart(value: string | Date): Date {
  return utcForBaghdadMidnight(value);
}

/** Return the last JavaScript-representable instant in a Baghdad calendar day. */
export function businessDayEnd(value: string | Date): Date {
  const current = dateParts(value);
  const next = new Date(
    Date.UTC(current.year, current.month - 1, current.day + 1),
  );
  return new Date(
    utcForBaghdadMidnight(
      `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`,
    ).getTime() - 1,
  );
}

/** Add calendar days to a Prisma DATE transport without elapsed-time arithmetic. */
export function addBusinessDateDays(value: Date, days: number): Date {
  const current = dateParts(value);
  return new Date(
    Date.UTC(current.year, current.month - 1, current.day + days),
  );
}

/** Whole calendar-day distance between two Prisma DATE transport values. */
export function businessDateDifference(later: Date, earlier: Date): number {
  const left = dateParts(later);
  const right = dateParts(earlier);
  return Math.floor(
    (Date.UTC(left.year, left.month - 1, left.day) -
      Date.UTC(right.year, right.month - 1, right.day)) /
      86_400_000,
  );
}

export function businessDateYear(value: Date): number {
  return parts(value).year;
}

/**
 * Resolve the exchange-rate cutoff for a document calendar date.
 * Today's documents use the posting instant; historical documents use that
 * Baghdad day's closing rate; future documents are capped at the posting time.
 */
export function exchangeRateCutoff(
  documentDate: Date,
  postedAt = new Date(),
): Date {
  const document = businessDateText(documentDate);
  const today = businessDateText(postedAt);
  return document < today ? businessDayEnd(document) : postedAt;
}

/**
 * Return the current Shubayr business date as a UTC-midnight Date value.
 *
 * Prisma maps PostgreSQL DATE columns to Date, so UTC midnight is the stable
 * transport representation. The calendar fields, however, are always derived
 * in Baghdad rather than from the server's UTC calendar.
 */
export function businessDate(now = new Date()): Date {
  return parseBusinessDate(businessDateText(now));
}
