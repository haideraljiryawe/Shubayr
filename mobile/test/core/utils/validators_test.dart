import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/utils/validators.dart';

void main() {
  group('Validators.foldDigits', () {
    test('folds Arabic-Indic and Persian digits to ASCII', () {
      expect(Validators.foldDigits('٧٧٠١٢٣٤٥٦٧'), '7701234567');
      expect(Validators.foldDigits('۰۹۸'), '098');
      expect(Validators.foldDigits('mix ٥ and 5'), 'mix 5 and 5');
    });
  });

  group('Validators.isPhone', () {
    test('accepts ASCII and Arabic-Indic numerals alike', () {
      expect(Validators.isPhone('7701234567'), isTrue);
      expect(Validators.isPhone('٧٧٠١٢٣٤٥٦٧'), isTrue);
      expect(Validators.isPhone('+964 770 123 4567'), isTrue);
      expect(Validators.isPhone('12'), isFalse);
      expect(Validators.isPhone('not a phone'), isFalse);
    });
  });

  group('Validators.isOtp', () {
    test('accepts a 6-digit code in either numeral system', () {
      expect(Validators.isOtp('123456'), isTrue);
      expect(Validators.isOtp('١٢٣٤٥٦'), isTrue);
      expect(Validators.isOtp('12345'), isFalse);
    });
  });

  group('Validators.normalizePhone', () {
    test('folds digits and strips separators for the API', () {
      expect(Validators.normalizePhone('٧٧٠-١٢٣ (٤٥٦٧)'), '7701234567');
    });
  });
}
