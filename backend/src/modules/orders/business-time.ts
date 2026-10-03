export type BusinessHour = {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function localParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function localDateKey(date: Date, timeZone: string) {
  const part = localParts(date, timeZone);
  return `${String(part.year).padStart(4, '0')}-${String(part.month).padStart(2, '0')}-${String(part.day).padStart(2, '0')}`;
}

function utcForLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = localParts(new Date(guess), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += desired - represented;
  }
  return new Date(guess);
}

function addLocalDays(date: Date, days: number, timeZone: string) {
  const part = localParts(date, timeZone);
  const calendar = new Date(
    Date.UTC(part.year, part.month - 1, part.day + days),
  );
  return {
    year: calendar.getUTCFullYear(),
    month: calendar.getUTCMonth() + 1,
    day: calendar.getUTCDate(),
    weekday: calendar.getUTCDay(),
  };
}

function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

/** Add elapsed minutes only while the configured store is open. */
export function addBusinessMinutes(
  start: Date,
  amount: number,
  hours: readonly BusinessHour[],
  closedDates: ReadonlySet<string>,
  timeZone = 'Asia/Baghdad',
): Date {
  if (!Number.isFinite(amount) || amount < 0)
    throw new RangeError('Business minutes must be non-negative');
  if (amount === 0) return new Date(start);
  const schedule = new Map(hours.map((row) => [row.weekday, row]));
  if (![...schedule.values()].some((row) => !row.is_closed))
    throw new RangeError('At least one business day must be open');

  let cursor = new Date(start);
  let remaining = amount;
  for (let scanned = 0; scanned < 3700; scanned += 1) {
    const local = localParts(cursor, timeZone);
    const calendar = addLocalDays(cursor, 0, timeZone);
    const row = schedule.get(calendar.weekday);
    const closed = closedDates.has(localDateKey(cursor, timeZone));
    if (row && !row.is_closed && !closed && row.opens_at && row.closes_at) {
      const openMinute = minutes(row.opens_at);
      const closeMinute = minutes(row.closes_at);
      const open = utcForLocal(
        local.year,
        local.month,
        local.day,
        Math.floor(openMinute / 60),
        openMinute % 60,
        timeZone,
      );
      const close = utcForLocal(
        local.year,
        local.month,
        local.day,
        Math.floor(closeMinute / 60),
        closeMinute % 60,
        timeZone,
      );
      const active = cursor < open ? open : cursor;
      if (active < close) {
        const available = (close.getTime() - active.getTime()) / 60_000;
        if (remaining <= available)
          return new Date(active.getTime() + remaining * 60_000);
        remaining -= available;
      }
    }
    const next = addLocalDays(cursor, 1, timeZone);
    cursor = utcForLocal(next.year, next.month, next.day, 0, 0, timeZone);
  }
  throw new RangeError('Could not find enough configured business time');
}
