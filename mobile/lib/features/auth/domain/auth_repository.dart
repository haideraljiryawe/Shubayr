import '../data/auth_result.dart';
import '../data/user.dart';
import 'profile_update.dart';

/// Authentication and self-profile operations in `api/openapi.yaml`.
abstract interface class AuthRepository {
  /// `POST /auth/request-otp`
  Future<void> requestOtp(String phone);

  /// `POST /auth/verify-otp`
  Future<AuthResult> verifyOtp({required String phone, required String code});

  /// `GET /me`
  Future<User> currentUser();

  /// `PATCH /me` returns the authoritative updated user.
  Future<User> updateProfile(ProfileUpdate update);
}
