import '../../../core/error/failure.dart';

/// PATCH /me: omitted fields are preserved; email can explicitly be cleared.
class ProfileUpdate {
  const ProfileUpdate({this.name, this.email, this.clearEmail = false});
  final String? name, email;
  final bool clearEmail;
  static const maxNameLength = 120;
  static const maxEmailLength = 160;

  static bool validName(String value) =>
      value.trim().isNotEmpty && value.trim().runes.length <= maxNameLength;
  static bool validEmail(String value) =>
      value.trim().runes.length <= maxEmailLength &&
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim());

  Map<String, dynamic> toJson() {
    if ((name == null && email == null && !clearEmail) ||
        (name != null && !validName(name!)) ||
        (email != null && (!validEmail(email!) || clearEmail))) {
      throw const AppFailure(FailureKind.validation);
    }
    return {
      if (name != null) 'name': name!.trim(),
      if (email != null || clearEmail)
        'email': clearEmail ? null : email!.trim(),
    };
  }
}
