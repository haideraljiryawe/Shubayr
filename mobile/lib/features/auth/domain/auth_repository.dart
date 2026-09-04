import '../data/auth_result.dart';
import '../data/user.dart';

/// Authentication against the three fully-specified auth endpoints in
/// `api/openapi.yaml`. Nothing else is assumed.
abstract interface class AuthRepository {
  /// `POST /auth/request-otp`
  Future<void> requestOtp(String phone);

  /// `POST /auth/verify-otp`
  Future<AuthResult> verifyOtp({required String phone, required String code});

  /// `GET /me`
  Future<User> currentUser();
}
