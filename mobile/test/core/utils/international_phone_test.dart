import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';
import 'package:shubayr/core/utils/international_phone.dart';
import 'package:shubayr/core/utils/validators.dart';

void main() {
  test(
    'device region wins; language alone never guesses a foreign country',
    () {
      expect(
        InternationalPhone.defaultCountry([const Locale('en', 'GB')]),
        IsoCode.GB,
      );
      expect(
        InternationalPhone.defaultCountry([const Locale('ar')]),
        IsoCode.IQ,
      );
      expect(
        InternationalPhone.defaultCountry([const Locale('en', 'ZZ')]),
        IsoCode.IQ,
      );
      expect(InternationalPhone.defaultCountry([]), IsoCode.IQ);
    },
  );
  for (final (input, country, expected) in [
    ('07811100070', IsoCode.IQ, '+9647811100070'),
    ('7811100070', IsoCode.IQ, '+9647811100070'),
    ('+9647811100070', IsoCode.IQ, '+9647811100070'),
    ('07701234567', IsoCode.IQ, '+9647701234567'),
    ('٠٧٨١٢٣٤٥٦٧٨', IsoCode.IQ, '+9647812345678'),
    ('۰۷۸۱۲۳۴۵۶۷۸', IsoCode.IQ, '+9647812345678'),
    ('020 7946 0018', IsoCode.GB, '+442079460018'),
    ('02 1234 5678', IsoCode.IT, '+390212345678'),
    ('+1 (202) 555-0123', IsoCode.IQ, '+12025550123'),
    ('+964 770 123 4567', IsoCode.GB, '+9647701234567'),
  ]) {
    test('normalizes $input without losing significant national zeros', () {
      expect(InternationalPhone.e164(input, country), expected);
      expect(
        Validators.normalizePhone(InternationalPhone.display(expected)),
        expected,
      );
    });
  }
  for (final invalid in [
    '',
    '123',
    '+000123456789',
    '+964123',
    'hello',
    '+964+7701234567',
    '+9649647811100070',
  ]) {
    test('rejects malformed phone $invalid', () {
      expect(InternationalPhone.e164(invalid, IsoCode.IQ), isNull);
    });
  }
  test('calling and copying never invent a country for legacy values', () {
    expect(InternationalPhone.canonical('+964 781 110 0070'), '+9647811100070');
    expect(
      InternationalPhone.callUri('+9647811100070').toString(),
      'tel:+9647811100070',
    );
    for (final value in ['07811100070', '+964123', 'old phone']) {
      expect(InternationalPhone.display(value), value);
      expect(InternationalPhone.canonical(value), isNull);
      expect(InternationalPhone.callUri(value), isNull);
    }
  });
  test('display does not reinterpret an existing account identity', () {
    expect(InternationalPhone.display('07701234567'), '07701234567');
    expect(InternationalPhone.display('+9647701234567'), '+964 770 123 4567');
    expect(InternationalPhone.parse('07701234567'), isNull);
  });
}
