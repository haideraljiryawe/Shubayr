import '../../../core/error/failure.dart';
import '../domain/auth_repository.dart';
import '../domain/profile_update.dart';
import '../domain/permissions.dart';
import 'auth_result.dart';
import 'user.dart';

/// In-memory auth for development before the backend is live.
///
/// Shapes match the `User` schema and the `verify-otp` response in
/// `api/openapi.yaml`. Any 6-digit code is accepted.
///
/// Dev convenience: the last digit of the phone number picks which area you
/// land in — `…1` signs in as a delivery agent, `…2` as staff, anything else
/// as a customer. This exists only so all three routing areas are reachable
/// without a backend; it is not API behaviour.
class AuthRepositoryMock implements AuthRepository {
  AuthRepositoryMock({this.delay = const Duration(milliseconds: 400)});

  final Duration delay;
  User? _signedIn;
  final _profiles = <String, User>{};

  @override
  Future<void> requestOtp(String phone) async {
    await Future<void>.delayed(delay);
  }

  @override
  Future<AuthResult> verifyOtp({
    required String phone,
    required String code,
  }) async {
    await Future<void>.delayed(delay);
    if (code.length != 6) {
      throw const AppFailure(FailureKind.validation);
    }
    final role = _roleForPhone(phone);
    final user =
        _profiles[phone] ??
        User(
          id: 'mock-user',
          name: null,
          phone: phone,
          role: role,
          permissions: Permissions.byRole[role] ?? const [],
        );
    _signedIn = user;
    _profiles[phone] = user;
    return AuthResult(
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      user: user,
    );
  }

  @override
  Future<User> currentUser() async {
    await Future<void>.delayed(delay);
    final user = _signedIn;
    if (user == null) throw const AppFailure.unauthorized();
    return user;
  }

  @override
  Future<User> updateProfile(ProfileUpdate update) async {
    final input = update.toJson();
    final current = _signedIn;
    if (current == null) throw const AppFailure.unauthorized();
    await Future<void>.delayed(delay);
    if (!identical(_signedIn, current)) throw const AppFailure.unauthorized();
    final saved = User.fromJson({...current.toJson(), ...input});
    _profiles[current.phone!] = saved;
    _signedIn = saved;
    return saved;
  }

  static String _roleForPhone(String phone) {
    final lastDigit = phone.isEmpty ? '' : phone.substring(phone.length - 1);
    return switch (lastDigit) {
      '1' => 'delivery',
      '2' => 'admin',
      _ => 'customer',
    };
  }
}
