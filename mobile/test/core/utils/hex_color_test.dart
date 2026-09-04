import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/utils/hex_color.dart';

void main() {
  group('tryParseHexColor', () {
    test('parses #RRGGBB', () {
      expect(tryParseHexColor('#5B8F6B'), const Color(0xFF5B8F6B));
    });

    test('parses RRGGBB without the hash', () {
      expect(tryParseHexColor('5B8F6B'), const Color(0xFF5B8F6B));
    });

    test('parses #AARRGGBB', () {
      expect(tryParseHexColor('#805B8F6B'), const Color(0x805B8F6B));
    });

    test('returns null for null, empty and malformed input', () {
      expect(tryParseHexColor(null), isNull);
      expect(tryParseHexColor(''), isNull);
      expect(tryParseHexColor('green'), isNull);
      expect(tryParseHexColor('#12345'), isNull);
    });
  });

  test('toHexRgb round-trips', () {
    expect(toHexRgb(const Color(0xFF5B8F6B)), '#5B8F6B');
  });
}
