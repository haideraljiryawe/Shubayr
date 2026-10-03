import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/utils/quantity.dart';

void main() {
  test('quantity formatting is natural and hides binary drift', () {
    for (final entry in <num, String>{
      0: '0',
      1: '1',
      1.0: '1',
      2: '2',
      1.5: '1.5',
      0.125: '0.125',
      1000: '1000',
      0.1 + 0.2: '0.3',
    }.entries) {
      expect(formatQuantity(entry.key), entry.value);
    }
  });
  test('local addition and subtraction use the contract quantum', () {
    expect(addQuantity(0.1, 0.2), 0.3);
    expect(subtractQuantity(0.3, 0.2), 0.1);
    expect(subtractQuantity(0.125, 0.124), 0.001);
    var sum = 0 as num;
    for (var i = 0; i < 1000; i++) {
      sum = addQuantity(sum, 0.001);
    }
    expect(sum, 1);
  });
  test('scale, bounds and whole-unit restrictions are distinct', () {
    for (final q in [0.001, 0.125, 0.5, 1.5, 2, 99]) {
      expect(isValidQuantity(q, max: 99), isTrue);
    }
    for (final q in [
      0,
      -1,
      0.0001,
      1.2345,
      99.001,
      double.nan,
      double.infinity,
    ]) {
      expect(isValidQuantity(q, max: 99), isFalse);
    }
    expect(isValidQuantity(0.125, wholeUnitsOnly: true), isFalse);
    expect(isValidQuantity(2, wholeUnitsOnly: true), isTrue);
    expect(isValidQuantity(0.5, max: 0.5), isTrue);
    expect(isValidQuantity(0.501, max: 0.5), isFalse);
    expect(isValidQuantity(120), isTrue); // Return contract has no cart cap.
  });
}
