import 'package:intl/intl.dart';

/// Formats money using the currency code from `StoreSettings.currency`.
///
/// The API returns plain numbers plus a currency code; the symbol and digit
/// grouping come from the active locale, so IQD renders correctly in both
/// Arabic and English.
String formatMoney(
  num amount, {
  required String currencyCode,
  required String localeCode,
}) {
  final format = NumberFormat.currency(
    locale: localeCode,
    name: currencyCode,
    symbol: _symbolFor(currencyCode, localeCode),
    decimalDigits: _decimalsFor(currencyCode),
  );
  return format.format(amount);
}

String? _symbolFor(String code, String localeCode) => switch (code) {
  'IQD' => localeCode.startsWith('ar') ? 'د.ع' : 'IQD',
  _ => null,
};

/// IQD has no minor unit in practice.
int _decimalsFor(String code) => code == 'IQD' ? 0 : 2;
