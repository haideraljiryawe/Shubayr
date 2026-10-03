import type { ApiFieldError } from '../../common/http/api-error';
import type { AdminSettingsUpdateDto } from './dto/admin-settings.dto';
import { parseBusinessDate } from '../finance/business-date';

type SettingsSnapshot = {
  settings: Record<string, string | null>;
};

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const PERCENT_KEYS = new Set(['cost', 'price', 'quantity', 'exchange_rate']);

function error(field: string, code: string, message: string): ApiFieldError {
  return { field, code, message };
}

function positiveInteger(
  value: string | null | undefined,
  field: string,
  errors: ApiFieldError[],
  required = true,
): number | undefined {
  if (value === null || value === undefined || value === '') {
    if (required) errors.push(error(field, 'required', `${field} is required`));
    return undefined;
  }
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    errors.push(
      error(field, 'positive_integer', `${field} must be a positive integer`),
    );
    return undefined;
  }
  return Number(value);
}

function decimalPlaces(value: string): number {
  return value.includes('.') ? value.length - value.indexOf('.') - 1 : 0;
}

function validCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  try {
    parseBusinessDate(value);
    return true;
  } catch {
    return false;
  }
}

export function validateSettingsUpdate(
  input: AdminSettingsUpdateDto,
  before: SettingsSnapshot,
  baseCurrencyPrecision: number,
): ApiFieldError[] {
  const errors: ApiFieldError[] = [];
  const supplied = input.settings ?? {};
  const merged = { ...before.settings, ...supplied };

  for (const [key, raw] of Object.entries(supplied)) {
    const field = `settings.${key}`;
    if (raw !== null && typeof raw !== 'string') {
      errors.push(
        error(field, 'isString', `${field} must be a string or null`),
      );
      continue;
    }
    const value = raw?.trim() ?? null;
    if (['store_name', 'store_address', 'store_phone'].includes(key)) {
      if (!value)
        errors.push(error(field, 'not_empty', `${field} must not be empty`));
      const maximum =
        key === 'store_address' ? 500 : key === 'store_name' ? 160 : 40;
      if (value && value.length > maximum)
        errors.push(
          error(
            field,
            'max_length',
            `${field} must be at most ${maximum} characters`,
          ),
        );
    } else if (key === 'logo_url' && value) {
      try {
        new URL(value);
      } catch {
        errors.push(error(field, 'url', `${field} must be a valid URL`));
      }
    } else if (
      key === 'primary_color' &&
      value &&
      !/^#[0-9a-f]{6}$/i.test(value)
    ) {
      errors.push(error(field, 'hex_color', `${field} must use #RRGGBB`));
    } else if (key === 'timezone') {
      if (!value) {
        errors.push(error(field, 'required', `${field} is required`));
      } else {
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
        } catch {
          errors.push(
            error(
              field,
              'iana_timezone',
              `${field} must be a valid IANA timezone`,
            ),
          );
        }
      }
    } else if (
      ['delivery_fee', 'sale_rounding_multiple'].includes(key) &&
      value !== null
    ) {
      if (
        !DECIMAL.test(value) ||
        decimalPlaces(value) > baseCurrencyPrecision
      ) {
        errors.push(
          error(
            field,
            'base_currency_amount',
            `${field} must be a non-negative base-currency amount with at most ${baseCurrencyPrecision} decimal places`,
          ),
        );
      }
    } else if (key === 'default_low_stock_threshold' && value !== null) {
      if (!DECIMAL.test(value) || decimalPlaces(value) > 3) {
        errors.push(
          error(
            field,
            'quantity_threshold',
            `${field} must be a non-negative quantity with at most 3 decimal places`,
          ),
        );
      }
    } else if (key === 'markup_alert_percent' && value !== null) {
      const numeric = Number(value);
      if (
        !DECIMAL.test(value) ||
        !Number.isFinite(numeric) ||
        numeric < 0 ||
        numeric > 100
      ) {
        errors.push(
          error(field, 'percentage', `${field} must be between 0 and 100`),
        );
      }
    } else if (
      ['acceptance_alert_timeout_minutes', 'backdating_window_days'].includes(
        key,
      )
    ) {
      positiveInteger(value, field, errors);
    } else if (
      key === 'auto_cancel_enabled' &&
      !['true', 'false'].includes(value ?? '')
    ) {
      errors.push(
        error(field, 'boolean', `${field} must be "true" or "false"`),
      );
    } else if (
      ['auto_cancel_timeout_minutes', 'auto_cancel_warning_minutes'].includes(
        key,
      ) &&
      value !== null
    ) {
      positiveInteger(value, field, errors);
    }
  }

  if (merged.auto_cancel_enabled === 'true') {
    const timeout = positiveInteger(
      merged.auto_cancel_timeout_minutes,
      'settings.auto_cancel_timeout_minutes',
      errors,
    );
    const warning = positiveInteger(
      merged.auto_cancel_warning_minutes,
      'settings.auto_cancel_warning_minutes',
      errors,
    );
    if (timeout !== undefined && warning !== undefined && warning >= timeout) {
      errors.push(
        error(
          'settings.auto_cancel_warning_minutes',
          'less_than_timeout',
          'settings.auto_cancel_warning_minutes must be shorter than settings.auto_cancel_timeout_minutes',
        ),
      );
    }
  }

  const seenWeekdays = new Set<number>();
  for (const [index, raw] of (input.business_hours ?? []).entries()) {
    const field = `business_hours.${index}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(error(field, 'isObject', `${field} must be an object`));
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (
      !Number.isInteger(row.weekday) ||
      Number(row.weekday) < 0 ||
      Number(row.weekday) > 6
    ) {
      errors.push(
        error(
          `${field}.weekday`,
          'weekday',
          `${field}.weekday must be an integer from 0 (Sunday) through 6 (Saturday)`,
        ),
      );
    } else if (seenWeekdays.has(Number(row.weekday))) {
      errors.push(
        error(
          `${field}.weekday`,
          'unique',
          `${field}.weekday must not be repeated`,
        ),
      );
    } else {
      seenWeekdays.add(Number(row.weekday));
    }
    if (typeof row.is_closed !== 'boolean') {
      errors.push(
        error(
          `${field}.is_closed`,
          'isBoolean',
          `${field}.is_closed must be a boolean`,
        ),
      );
      continue;
    }
    if (row.is_closed) {
      if (row.opens_at !== null || row.closes_at !== null) {
        errors.push(
          error(
            field,
            'closed_hours',
            `${field} must use null opening and closing times when closed`,
          ),
        );
      }
      continue;
    }
    if (typeof row.opens_at !== 'string' || !TIME.test(row.opens_at)) {
      errors.push(
        error(
          `${field}.opens_at`,
          'time',
          `${field}.opens_at must use HH:MM (00:00-23:59)`,
        ),
      );
    }
    if (typeof row.closes_at !== 'string' || !TIME.test(row.closes_at)) {
      errors.push(
        error(
          `${field}.closes_at`,
          'time',
          `${field}.closes_at must use HH:MM (00:00-23:59)`,
        ),
      );
    }
    if (
      typeof row.opens_at === 'string' &&
      typeof row.closes_at === 'string' &&
      TIME.test(row.opens_at) &&
      TIME.test(row.closes_at) &&
      row.opens_at >= row.closes_at
    ) {
      errors.push(
        error(
          `${field}.closes_at`,
          'after_open',
          `${field}.closes_at must be after opens_at`,
        ),
      );
    }
  }

  const seenDates = new Set<string>();
  for (const [index, raw] of (input.closed_days ?? []).entries()) {
    const field = `closed_days.${index}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(error(field, 'isObject', `${field} must be an object`));
      continue;
    }
    const row = raw as Record<string, unknown>;
    if (typeof row.date !== 'string' || !validCalendarDate(row.date)) {
      errors.push(
        error(
          `${field}.date`,
          'date',
          `${field}.date must be a valid YYYY-MM-DD calendar date`,
        ),
      );
    } else if (seenDates.has(row.date)) {
      errors.push(
        error(`${field}.date`, 'unique', `${field}.date must not be repeated`),
      );
    } else {
      seenDates.add(row.date);
    }
    if (
      row.reason !== undefined &&
      (typeof row.reason !== 'string' || row.reason.length > 255)
    ) {
      errors.push(
        error(
          `${field}.reason`,
          'max_length',
          `${field}.reason must be a string of at most 255 characters`,
        ),
      );
    }
  }

  for (const [key, percent] of Object.entries(
    input.protection_thresholds ?? {},
  )) {
    const field = `protection_thresholds.${key}`;
    if (!PERCENT_KEYS.has(key)) {
      errors.push(
        error(
          field,
          'unknown',
          `${field} is not a supported protection threshold`,
        ),
      );
    }
    if (
      typeof percent !== 'number' ||
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > 100 ||
      Math.round(percent * 100) !== percent * 100
    ) {
      errors.push(
        error(
          field,
          'percentage',
          `${field} must be between 0 and 100 with at most 2 decimal places`,
        ),
      );
    }
  }

  return errors;
}
