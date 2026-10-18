import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the bearer token issued by `POST /auth/verify-otp`.
///
/// Refresh tokens rotate through /auth/refresh and are revoked at sign-out.
typedef AccountScope = ({String api, String userId});

abstract interface class TokenStore {
  Future<String?> readAccessToken();
  Future<String?> readRefreshToken();
  Future<void> save({required String accessToken, String? refreshToken});
  Future<void> clear();
  Future<AccountScope?> readAccountScope();
  Future<void> saveAccountScope(AccountScope? scope);
}

class SecureTokenStore implements TokenStore {
  const SecureTokenStore([this._storage = const FlutterSecureStorage()]);

  static const _accessKey = 'auth.access_token';
  static const _refreshKey = 'auth.refresh_token';
  static const _accountKey = 'auth.account_scope';

  final FlutterSecureStorage _storage;

  @override
  Future<AccountScope?> readAccountScope() async {
    final raw = await _storage.read(key: _accountKey);
    if (raw == null) return null;
    try {
      final value = jsonDecode(raw);
      if (value case {'api': String api, 'userId': String id}) {
        if (api.isNotEmpty && id.isNotEmpty) return (api: api, userId: id);
      }
    } on FormatException {
      // Cleanup metadata never authorizes a session or invalidates tokens.
    }
    return null;
  }

  @override
  Future<void> saveAccountScope(AccountScope? scope) => scope == null
      ? _storage.delete(key: _accountKey)
      : _storage.write(
          key: _accountKey,
          value: jsonEncode({'api': scope.api, 'userId': scope.userId}),
        );

  @override
  Future<String?> readAccessToken() => _storage.read(key: _accessKey);

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    await _storage.write(key: _accessKey, value: accessToken);
    if (refreshToken != null) {
      await _storage.write(key: _refreshKey, value: refreshToken);
    } else {
      await _storage.delete(key: _refreshKey);
    }
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _accessKey);
    await _storage.delete(key: _refreshKey);
    await _storage.delete(key: _accountKey);
  }
}

/// Non-persistent token store for tests and widget previews.
class InMemoryTokenStore implements TokenStore {
  InMemoryTokenStore({this._accessToken});

  String? _accessToken;
  String? _refreshToken;
  AccountScope? _accountScope;

  @override
  Future<AccountScope?> readAccountScope() async => _accountScope;

  @override
  Future<void> saveAccountScope(AccountScope? scope) async =>
      _accountScope = scope;

  /// Exposed so tests can assert what was persisted.
  String? get refreshToken => _refreshToken;

  @override
  Future<String?> readAccessToken() async => _accessToken;

  @override
  Future<String?> readRefreshToken() async => _refreshToken;

  @override
  Future<void> save({required String accessToken, String? refreshToken}) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    _accessToken = null;
    _refreshToken = null;
    _accountScope = null;
  }
}

final tokenStoreProvider = Provider<TokenStore>(
  (ref) => const SecureTokenStore(),
);
