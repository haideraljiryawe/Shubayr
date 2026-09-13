/// Locale-independent digit normalization shared by inputs and API boundaries.
String normalizeDigits(String value) => String.fromCharCodes(
  value.runes.map((rune) {
    if (rune >= 0x0660 && rune <= 0x0669) return 0x30 + rune - 0x0660;
    if (rune >= 0x06f0 && rune <= 0x06f9) return 0x30 + rune - 0x06f0;
    return rune;
  }),
);

/// Text operations only: grouping never rounds or converts through a double.
/// Monetary contracts remain `num`; points and identifiers do not use this.
abstract final class MoneyText {
  static String normalize(String text) => normalizeDigits(
    text,
  ).replaceAll(',', '').replaceAll('٬', '').replaceAll('٫', '.').trim();

  /// Signs and a trailing decimal point are valid *editing* states. Required,
  /// nonnegative and integer constraints remain the responsibility of the form.
  static bool isEditable(String raw) =>
      RegExp(r'^[+-]?[0-9]*(\.[0-9]*)?$').hasMatch(raw);

  static num? tryParse(String text) {
    final raw = normalize(text);
    if (!isEditable(raw)) return null;
    final value = num.tryParse(raw);
    return value != null && value.isFinite ? value : null;
  }

  static String format(String text) {
    final raw = normalize(text);
    if (!isEditable(raw)) throw FormatException('Invalid money text', text);
    final dot = raw.indexOf('.');
    final integer = dot < 0 ? raw : raw.substring(0, dot);
    final fraction = dot < 0 ? '' : raw.substring(dot);
    return integer.replaceAllMapped(
          RegExp(r'[0-9](?=(?:[0-9]{3})+$)'),
          (match) => '${match[0]},',
        ) +
        fraction;
  }

  /// Controllers are not processed by input formatters on initialization.
  /// Expand exponent notation from num.toString without changing precision.
  static String fromNumber(num? value) {
    if (value == null) return '';
    var raw = value.toString();
    final exponent = raw.toLowerCase().indexOf('e');
    if (exponent >= 0) {
      final power = int.parse(raw.substring(exponent + 1));
      var mantissa = raw.substring(0, exponent);
      final sign = mantissa.startsWith('-') ? '-' : '';
      if (sign.isNotEmpty) mantissa = mantissa.substring(1);
      final dot = mantissa.indexOf('.');
      final digits = mantissa.replaceAll('.', '');
      final position = (dot < 0 ? mantissa.length : dot) + power;
      raw = position <= 0
          ? '${sign}0.${'0' * -position}$digits'
          : position >= digits.length
          ? '$sign$digits${'0' * (position - digits.length)}'
          : '$sign${digits.substring(0, position)}.${digits.substring(position)}';
    }
    return format(raw);
  }
}
