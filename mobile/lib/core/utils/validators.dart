import 'numeric_text.dart';

/// Input validation shared by forms.
abstract final class Validators {
  /// Loose international phone check — the backend owns the real rule, this
  /// only stops obviously malformed input before an OTP is requested.
  static bool isPhone(String value) {
    final trimmed = foldDigits(value).replaceAll(RegExp(r'[\s\-()]'), '');
    return RegExp(r'^\+?[0-9]{8,15}$').hasMatch(trimmed);
  }

  static bool isE164Phone(String value) =>
      RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(normalizePhone(value));

  /// `POST /auth/verify-otp` documents a 6-digit code.
  static bool isOtp(String value) =>
      RegExp(r'^[0-9]{6}$').hasMatch(foldDigits(value).trim());

  /// Strips spaces and separators before sending to the API, and folds any
  /// Arabic-Indic digits to ASCII so the backend always receives 0-9.
  static String normalizePhone(String value) =>
      foldDigits(value).replaceAll(RegExp(r'[\s\-()]'), '');

  /// Converts Arabic-Indic (٠-٩) and Extended/Persian (۰-۹) digits to ASCII.
  /// This is an Arabic-first app, so an Arabic keyboard's numerals must be
  /// accepted everywhere a number is entered.
  static String foldDigits(String value) => normalizeDigits(value);
}
