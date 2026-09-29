import '../../../core/network/api_client.dart';
import '../domain/auth_repository.dart';
import '../domain/profile_update.dart';
import 'auth_result.dart';
import 'user.dart';

class AuthRepositoryRemote implements AuthRepository {
  const AuthRepositoryRemote(this._api);

  final ApiClient _api;

  @override
  Future<void> requestOtp(String phone) => _api.post<Map<String, dynamic>>(
    '/auth/request-otp',
    body: {'phone': phone},
  );

  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/auth/verify-otp',
      body: {'phone': phone, 'code': code, 'client': 'mobile'},
    );
    return AuthResult.fromJson(json);
  }

  @override
  Future<void> logout(String refreshToken) async {
    await _api.dio.post<void>(
      '/auth/logout',
      data: {'refresh_token': refreshToken},
    );
  }

  @override
  Future<User> currentUser() async {
    final json = await _api.get<Map<String, dynamic>>('/me');
    return User.fromJson(json);
  }

  @override
  Future<User> updateProfile(ProfileUpdate update) async {
    final json = await _api.patch<Map<String, dynamic>>(
      '/me',
      body: update.toJson(),
    );
    return User.fromJson(json);
  }
}
