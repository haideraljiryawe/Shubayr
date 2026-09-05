/// Input validation shared by forms.
abstract final class Validators {
  /// Loose international phone check — the backend owns the real rule, this
  /// only stops obviously malformed input before an OTP is requested.
  static bool isPhone(String value) {
    final trimmed = value.replaceAll(RegExp(r'[\s\-()]'), '');
    return RegExp(r'^\+?[0-9]{8,15}$').hasMatch(trimmed);
  }

  /// `POST /auth/verify-otp` documents a 6-digit code.
  static bool isOtp(String value) =>
      RegExp(r'^[0-9]{6}$').hasMatch(value.trim());

  /// Strips spaces and separators before sending to the API.
  static String normalizePhone(String value) =>
      value.replaceAll(RegExp(r'[\s\-()]'), '');
}
