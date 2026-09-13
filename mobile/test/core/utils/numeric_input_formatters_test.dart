import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/utils/numeric_input_formatters.dart';
import 'package:shubayr/core/utils/numeric_text.dart';

TextEditingValue value(String text, [int? caret, int? extent]) =>
    TextEditingValue(
      text: text,
      selection: TextSelection(
        baseOffset: caret ?? text.length,
        extentOffset: extent ?? caret ?? text.length,
      ),
    );

void main() {
  const money = MoneyInputFormatter();
  const digits = WesternDigitsInputFormatter();
  group('Western digits', () {
    for (final input in ['0123456789', '٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹']) {
      test('normalizes $input with selection intact', () {
        final result = digits.formatEditUpdate(value(''), value(input, 8, 2));
        expect(result.text, '0123456789');
        expect(result.selection, value(input, 8, 2).selection);
      });
    }
    test('normalizes mixed text without filtering letters or phone syntax', () {
      expect(normalizeDigits('🏠 ١٢٣ / ۱۲۳ (+٩٦٤)'), '🏠 123 / 123 (+964)');
    });
    test('phone and OTP never get grouping', () {
      for (final (input, expected) in [
        ('٠٧٧٠١٢٣٤٥٦٧', '07701234567'),
        ('۱۲۳۴۵۶', '123456'),
      ]) {
        expect(digits.formatEditUpdate(value(''), value(input)).text, expected);
      }
    });
  });

  group('money paste and parsing', () {
    for (final input in [
      '1500000',
      '١٥٠٠٠٠٠',
      '۱۵۰۰۰۰۰',
      '1,500,000',
      '١٬٥٠٠٬٠٠٠',
      '  1,,500,,,000  ',
    ]) {
      test('formats pasted $input and is idempotent', () {
        final result = money.formatEditUpdate(value(''), value(input));
        expect(result, value('1,500,000'));
        expect(money.formatEditUpdate(result, result), result);
        expect(MoneyText.tryParse(result.text), 1500000);
      });
    }
    for (final (input, expected) in [
      ('1,250', 1250),
      ('١٢٥٠', 1250),
      ('۱۲۵۰', 1250),
      ('1,250,000', 1250000),
      ('-١٬٢٥٠٫٥٠', -1250.5),
      ('+12,500.125', 12500.125),
    ]) {
      test('parses $input as a finite raw number', () {
        expect(MoneyText.tryParse(input), expected);
        expect(MoneyText.normalize(input), isNot(contains(',')));
      });
    }
    test('invalid and incomplete text is not a domain number', () {
      for (final input in [
        '',
        '-',
        '.',
        '-.',
        'NaN',
        'Infinity',
        '1.2.3',
        'x1',
      ]) {
        expect(MoneyText.tryParse(input), isNull);
      }
    });
    test(
      'preserves decimal precision, trailing zeros, signs and leading zeros',
      () {
        for (final (input, expected) in [
          ('-1250.500', '-1,250.500'),
          ('+1250.', '+1,250.'),
          ('0001234', '0,001,234'),
          ('.50', '.50'),
        ]) {
          expect(
            money.formatEditUpdate(value(''), value(input)),
            value(expected),
          );
        }
        expect(MoneyText.fromNumber(1250.5), '1,250.5');
        expect(MoneyText.fromNumber(null), '');
        for (final number in [1e21, -1.234e25, 1e-7, -1.23e-10]) {
          expect(MoneyText.tryParse(MoneyText.fromNumber(number)), number);
        }
      },
    );
    test('rejects invalid edits instead of silently changing the amount', () {
      final old = value('1,250', 3);
      for (final input in ['1x250', '12.5.0', '--1250', '12-50']) {
        expect(money.formatEditUpdate(old, value(input)), old);
      }
    });
  });

  group('money editing and selection', () {
    test('inserts in the middle without jumping to the end', () {
      expect(
        money.formatEditUpdate(value('12,345', 4), value('12,3945', 5)),
        value('123,945', 5),
      );
    });
    test('backspaces a digit in the middle and regroups', () {
      expect(
        money.formatEditUpdate(value('123,456', 2), value('13,456', 1)),
        value('13,456', 1),
      );
    });
    test('backspace across a comma deletes the preceding digit', () {
      expect(
        money.formatEditUpdate(value('12,345', 3), value('12345', 2)),
        value('1,345', 1),
      );
    });
    test('forward delete across a comma deletes the following digit', () {
      expect(
        money.formatEditUpdate(value('12,345', 2), value('12345', 2)),
        value('1,245', 3),
      );
    });
    test('replaces a reverse selection and can clear everything', () {
      expect(
        money.formatEditUpdate(value('12,345', 5, 1), value('195', 2)),
        value('195', 2),
      );
      expect(
        money.formatEditUpdate(value('1,500,000', 0, 9), value('')),
        value(''),
      );
      expect(money.formatEditUpdate(value('1'), value('')), value(''));
    });
    test('maps both endpoints and retains direction and affinity', () {
      final input = value('1234567', 6, 1).copyWith(
        selection: const TextSelection(
          baseOffset: 6,
          extentOffset: 1,
          affinity: TextAffinity.upstream,
          isDirectional: true,
        ),
      );
      final result = money.formatEditUpdate(value(''), input);
      expect(result.text, '1,234,567');
      expect(
        result.selection,
        input.selection.copyWith(baseOffset: 8, extentOffset: 1),
      );
    });
    test('selection-only updates preserve every position around commas', () {
      for (var base = 0; base <= 9; base++) {
        for (var extent = 0; extent <= 9; extent++) {
          final next = value('1,234,567', base, extent);
          expect(money.formatEditUpdate(value('1,234,567'), next), next);
        }
      }
      const noSelection = TextEditingValue(text: '1250');
      final result = money.formatEditUpdate(value(''), noSelection);
      expect(result.text, '1,250');
      expect(result.selection, noSelection.selection);
    });
    test('does not disrupt IME composition and formats on commit', () {
      final composing = value(
        '١٢٥٠',
      ).copyWith(composing: const TextRange(start: 0, end: 4));
      for (final formatter in [money, digits]) {
        expect(formatter.formatEditUpdate(value(''), composing), composing);
        final committed = formatter.formatEditUpdate(
          composing,
          composing.copyWith(composing: TextRange.empty),
        );
        expect(committed.text, formatter == money ? '1,250' : '1250');
        expect(committed.composing, TextRange.empty);
      }
    });
  });

  testWidgets(
    'real text input keeps controller and middle-edit caret formatted',
    (tester) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              controller: controller,
              inputFormatters: const [money],
            ),
          ),
        ),
      );
      await tester.enterText(find.byType(TextField), '١٢٣٤٥');
      expect(controller.text, '12,345');
      tester.testTextInput.updateEditingValue(value('12,345', 4));
      await tester.pump();
      tester.testTextInput.updateEditingValue(value('12,3945', 5));
      await tester.pump();
      expect(controller.value, value('123,945', 5));
      await tester.enterText(find.byType(TextField), '');
      expect(controller.text, '');
      expect(tester.takeException(), isNull);
    },
  );
}
