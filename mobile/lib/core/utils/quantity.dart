/// API v9 quantities have a 0.001 quantum. Models retain the original `num`;
/// only local quantity arithmetic uses thousandths to avoid binary drift.
num addQuantity(num a, num b) =>
    ((a * 1000).round() + (b * 1000).round()) / 1000;

num subtractQuantity(num a, num b) => addQuantity(a, -b);

bool isValidQuantity(
  num value, {
  bool wholeUnitsOnly = false,
  num min = 0.001,
  num? max,
}) {
  if (!value.isFinite || value < min || (max != null && value > max)) {
    return false;
  }
  if (wholeUnitsOnly) return value == value.round();
  // Accept representation noise at the 0.001 scale, not a fourth decimal.
  final scaled = value * 1000;
  return (scaled - scaled.round()).abs() < 0.0000001;
}

/// Western digits, no grouping or trailing zeroes; never used for money.
String formatQuantity(num value) =>
    value.toStringAsFixed(3).replaceFirst(RegExp(r'\.?0+$'), '');
