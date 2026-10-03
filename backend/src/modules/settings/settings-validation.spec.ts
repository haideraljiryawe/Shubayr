import { validateSettingsUpdate } from './settings-validation';
import type { AdminSettingsUpdateDto } from './dto/admin-settings.dto';

const before = {
  settings: {
    timezone: 'Asia/Baghdad',
    delivery_fee: '5000',
    acceptance_alert_timeout_minutes: '15',
    auto_cancel_enabled: 'false',
    auto_cancel_timeout_minutes: null,
    auto_cancel_warning_minutes: null,
    default_low_stock_threshold: '5',
    backdating_window_days: '90',
    markup_alert_percent: null,
    sale_rounding_multiple: '0',
    separation_of_duties_level: 'standard',
  },
};

describe('server-side settings validation', () => {
  it.each([
    [{ settings: { timezone: 'Baghdad/Nowhere' } }, 'settings.timezone'],
    [{ settings: { delivery_fee: '-1' } }, 'settings.delivery_fee'],
    [
      { settings: { backdating_window_days: '0' } },
      'settings.backdating_window_days',
    ],
    [
      { settings: { markup_alert_percent: '101' } },
      'settings.markup_alert_percent',
    ],
    [
      { settings: { default_low_stock_threshold: '-1' } },
      'settings.default_low_stock_threshold',
    ],
    [
      { protection_thresholds: { price: 100.001 } },
      'protection_thresholds.price',
    ],
    [{ closed_days: [{ date: '2026-02-30' }] }, 'closed_days.0.date'],
    [
      { settings: { separation_of_duties_level: 'relaxed' } },
      'settings.separation_of_duties_level',
    ],
  ])('rejects invalid field input %#', (input, field) => {
    expect(
      validateSettingsUpdate(input as AdminSettingsUpdateDto, before, 0),
    ).toEqual(expect.arrayContaining([expect.objectContaining({ field })]));
  });

  it('requires valid ordered hours and documents the persisted weekday convention', () => {
    const errors = validateSettingsUpdate(
      {
        business_hours: [
          {
            weekday: 7,
            opens_at: '17:00',
            closes_at: '09:00',
            is_closed: false,
          },
        ],
      },
      before,
      0,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'business_hours.0.weekday' }),
        expect.objectContaining({ field: 'business_hours.0.closes_at' }),
      ]),
    );
  });

  it('requires an auto-cancel timeout and a shorter warning', () => {
    const errors = validateSettingsUpdate(
      {
        settings: {
          auto_cancel_enabled: 'true',
          auto_cancel_timeout_minutes: '30',
          auto_cancel_warning_minutes: '30',
        },
      },
      before,
      0,
    );
    expect(errors).toEqual([
      expect.objectContaining({
        field: 'settings.auto_cancel_warning_minutes',
        code: 'less_than_timeout',
      }),
    ]);
  });

  it('accepts Sunday=0 through Saturday=6 and fractional percentages', () => {
    const errors = validateSettingsUpdate(
      {
        business_hours: [
          {
            weekday: 0,
            opens_at: '09:00',
            closes_at: '17:00',
            is_closed: false,
          },
          { weekday: 6, opens_at: null, closes_at: null, is_closed: true },
        ],
        protection_thresholds: { price: 50.25 },
      },
      before,
      0,
    );
    expect(errors).toEqual([]);
  });
});
