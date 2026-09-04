import 'package:flutter/painting.dart';

/// Parses colours supplied by the API (`StoreSettings.primary_color`).
///
/// Accepts `#RRGGBB`, `RRGGBB`, `#AARRGGBB` and `AARRGGBB`. Returns `null`
/// for anything else so callers can fall back to the bundled brand.
Color? tryParseHexColor(String? value) {
  if (value == null) return null;
  var hex = value.trim().replaceFirst('#', '');
  if (hex.length == 6) hex = 'FF$hex';
  if (hex.length != 8) return null;
  final parsed = int.tryParse(hex, radix: 16);
  return parsed == null ? null : Color(parsed);
}

/// `#RRGGBB` representation — used for platform surfaces (e.g. web manifest).
String toHexRgb(Color color) {
  final argb = color.toARGB32() & 0xFFFFFF;
  return '#${argb.toRadixString(16).padLeft(6, '0').toUpperCase()}';
}
