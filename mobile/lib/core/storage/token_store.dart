import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the bearer token issued by `POST /auth/verify-otp`.
///
/// The refresh token is stored too, but nothing consumes it yet:
/// `api/openapi.yaml` defines no refresh endpoint, so no refresh flow is
/// implemented.
abstract interface class TokenStore {
  Future<String?> readAccessToken();
  Future<void> save({required String accessToken, String? refreshToken});
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  const SecureTokenStore([this._storage = const FlutterSecureStorage()]);

  static const _accessKey = 'auth.access_token';
  static const _refreshKey = 'auth.refresh_token';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> readAccessToken() => _storage.read(key: _accessKey);

  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    await _storage.write(key: _accessKey, value: accessToken);
    if (refreshToken != null) {
      await _storage.write(key: _refreshKey, value: refreshToken);
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
  }
}

/// Non-persistent token store for tests and widget previews.
class InMemoryTokenStore implements TokenStore {
  InMemoryTokenStore({this._accessToken});

  String? _accessToken;
  String? _refreshToken;

  /// Exposed so tests can assert what was persisted.
  String? get refreshToken => _refreshToken;

  @override
  Future<String?> readAccessToken() async => _accessToken;

  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
  }
}

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => const SecureTokenStore(),
);
