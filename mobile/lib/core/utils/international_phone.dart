import 'dart:ui' show Locale;
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

import 'validators.dart';

/// Input/display conversion only; stored account identities remain untouched.
abstract final class InternationalPhone {
  static IsoCode defaultCountry(List<Locale> locales) {
    for (final locale in locales) {
      final region = locale.countryCode?.toUpperCase();
      for (final code in IsoCode.values) {
        if (code.name == region) return code;
      }
    }
    return IsoCode.IQ;
  }

  static PhoneNumber? parse(String value, {IsoCode? country}) {
    final raw = Validators.normalizePhone(value);
    if (!RegExp(r'^\+?[0-9]+$').hasMatch(raw)) return null;
    // Never infer a stored number's country from its first national digits.
    if (!raw.startsWith('+') && country == null) return null;
    try {
      return PhoneNumber.parse(raw, callerCountry: country);
    } on Exception {
      return null;
    }
  }

  static String? e164(String value, IsoCode country) {
    final parsed = parse(value, country: country);
    return parsed != null &&
            parsed.isValid() &&
            Validators.isE164Phone(parsed.international)
        ? parsed.international
        : null;
  }

  /// Canonicalize an already international identity, without a guessed region.
  static String? canonical(String value) {
    final raw = Validators.normalizePhone(value);
    final parsed = parse(raw);
    return Validators.isE164Phone(raw) &&
            parsed != null &&
            parsed.isValid() &&
            parsed.international == raw
        ? raw
        : null;
  }

  static Uri? callUri(String value) {
    final number = canonical(value);
    return number == null ? null : Uri(scheme: 'tel', path: number);
  }

  static String display(String value) {
    final parsed = parse(value);
    // Formatting must not change the identity represented on the screen.
    if (parsed == null ||
        !parsed.isValid() ||
        parsed.international != Validators.normalizePhone(value)) {
      return value;
    }
    return '+${parsed.countryCode} ${parsed.formatNsn(format: NsnFormat.international)}';
  }
}
