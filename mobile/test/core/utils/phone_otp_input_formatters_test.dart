import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/utils/numeric_input_formatters.dart';
import 'package:shubayr/core/utils/validators.dart';

TextEditingValue value(String text, [int? base, int? extent]) =>
    TextEditingValue(
      text: text,
      selection: TextSelection(
        baseOffset: base ?? text.length,
        extentOffset: extent ?? base ?? text.length,
      ),
    );

void main() {
  const phone = PhoneInputFormatter();
  const otp = OtpInputFormatter();

  for (final (input, expected) in [
    ('12,312', '12312'),
    ('+٩٦٤ ٧٧٠ ١٢٣ ٤٥٦٧', '+9647701234567'),
    ('0770 123 4567', '07701234567'),
    ('0770-123-4567', '07701234567'),
    ('(0770) 123 4567', '07701234567'),
    ('+964,770,123,4567', '+9647701234567'),
    (' +۴۴ (۲۰) ۷۱۲۳-۴۵۶۷ ', '+442071234567'),
    ('+1\u00a0(202)\u202f555–0123', '+12025550123'),
    ('٠٧٧٠٬١٢٣٬٤٥٦٧', '07701234567'),
    ('07701234567', '07701234567'),
    ('+9647701234567', '+9647701234567'),
    ('++964+770+1234567+', '+9647701234567'),
    ('0770+1234567', '07701234567'),
    ('+', '+'),
    ('', ''),
  ]) {
    test('phone cleans $input without country canonicalization', () {
      final result = phone.formatEditUpdate(value(''), value(input));
      expect(result, value(expected));
      expect(result.text, matches(RegExp(r'^\+?[0-9]*$')));
      expect(phone.formatEditUpdate(result, result), result);
    });
  }

  for (final (input, expected) in [
    ('12,312', '12312'),
    ('١٢٣ ٤٥٦', '123456'),
    ('۱۲۳-۴۵۶', '123456'),
    ('+١٢٣٬٤٥٦+', '123456'),
    ('abc (12).3 / ٤٥٦', '123456'),
    ('123456', '123456'),
    ('+++ , - ', ''),
    ('', ''),
  ]) {
    test('OTP cleans $input to digits only', () {
      final result = otp.formatEditUpdate(value(''), value(input));
      expect(result, value(expected));
      expect(result.text, matches(RegExp(r'^[0-9]*$')));
      expect(otp.formatEditUpdate(result, result), result);
    });
  }

  test('length validation stays separate from formatting', () {
    for (final (input, valid) in [
      ('12,312', false),
      ('١٢٣ ٤٥٦', true),
      ('۱۲۳-۴۵۶', true),
      ('123-456-7', false),
      ('', false),
    ]) {
      final result = otp.formatEditUpdate(value(''), value(input));
      expect(Validators.isOtp(result.text), valid);
    }
    expect(Validators.isPhone('+442071234567'), isTrue);
    expect(Validators.isPhone('+12025550123'), isTrue);
    expect(Validators.isPhone('12312'), isFalse);
  });

  for (final formatter in [phone, otp]) {
    group('$formatter editing', () {
      test('maps reverse selection including removed symbols', () {
        final input = value('١٢, ٣-٤٥٦', 8, 2).copyWith(
          selection: const TextSelection(
            baseOffset: 8,
            extentOffset: 2,
            affinity: TextAffinity.upstream,
            isDirectional: true,
          ),
        );
        final result = formatter.formatEditUpdate(value(''), input);
        expect(result.text, '123456');
        expect(
          result.selection,
          input.selection.copyWith(baseOffset: 5, extentOffset: 2),
        );
      });
      test('paste in the middle retains the caret after pasted digits', () {
        expect(
          formatter.formatEditUpdate(
            value('123456', 3),
            value('123 ٩- 456', 7),
          ),
          value('1239456', 4),
        );
      });
      test('insertion, backspace and forward delete stay at the edit', () {
        expect(
          formatter.formatEditUpdate(value('123456', 2), value('12٣3456', 3)),
          value('1233456', 3),
        );
        expect(
          formatter.formatEditUpdate(value('123456', 3), value('12456', 2)),
          value('12456', 2),
        );
        expect(
          formatter.formatEditUpdate(value('123456', 2), value('12456', 2)),
          value('12456', 2),
        );
      });
      test('replaces a selection and deletes everything', () {
        expect(
          formatter.formatEditUpdate(value('123456', 5, 1), value('1 ٩ 6', 4)),
          value('196', 2),
        );
        expect(
          formatter.formatEditUpdate(value('123456', 0, 6), value('')),
          value(''),
        );
      });
      test('maps every selection endpoint without moving valid text', () {
        const input = '١٢, ٣-٤٥٦';
        const offsets = [0, 1, 2, 2, 2, 3, 3, 4, 5, 6];
        for (var base = 0; base <= input.length; base++) {
          for (var extent = 0; extent <= input.length; extent++) {
            final result = formatter.formatEditUpdate(
              value(''),
              value(input, base, extent),
            );
            expect(result, value('123456', offsets[base], offsets[extent]));
            expect(formatter.formatEditUpdate(result, result), result);
          }
        }
        final result = formatter.formatEditUpdate(
          value(''),
          const TextEditingValue(text: '١٢,٣'),
        );
        expect(result.text, '123');
        expect(result.selection, const TextSelection.collapsed(offset: -1));
      });
      test('defers during IME composition and cleans on commit', () {
        final composing = value(
          '١٢٣ ٤٥٦',
        ).copyWith(composing: const TextRange(start: 0, end: 7));
        expect(formatter.formatEditUpdate(value(''), composing), composing);
        expect(
          formatter.formatEditUpdate(
            composing,
            composing.copyWith(composing: TextRange.empty),
          ),
          value('123456'),
        );
      });
    });
  }

  test('phone removes misplaced plus without moving the caret to the end', () {
    expect(
      phone.formatEditUpdate(value('+123456', 3), value('+12+3456', 4)),
      value('+123456', 3),
    );
    expect(
      phone.formatEditUpdate(value('123456', 0), value('+123456', 1)),
      value('+123456', 1),
    );
    expect(
      phone.formatEditUpdate(value('+123456', 1), value('123456', 0)),
      value('123456', 0),
    );
  });
}
