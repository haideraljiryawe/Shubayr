import 'package:json_annotation/json_annotation.dart';

import 'user.dart';

part 'auth_result.g.dart';

/// Response of `POST /auth/verify-otp`.
@JsonSerializable(fieldRename: FieldRename.snake)
class AuthResult {
  const AuthResult({this.accessToken, this.refreshToken, this.user});

  factory AuthResult.fromJson(Map<String, dynamic> json) =>
      _$AuthResultFromJson(json);

  final String? accessToken;

  /// Used for automatic rotation and sign-out revocation.
  final String? refreshToken;
  final User? user;

  Map<String, dynamic> toJson() => _$AuthResultToJson(this);
}
