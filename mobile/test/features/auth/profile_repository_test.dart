import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/auth_repository_remote.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';

void main() {
  test('partial updates, email clearing, limits and forbidden properties', () {
    expect(const ProfileUpdate(name: ' أحمد ').toJson(), {'name': 'أحمد'});
    expect(const ProfileUpdate(email: ' ali@example.com ').toJson(), {
      'email': 'ali@example.com',
    });
    expect(const ProfileUpdate(clearEmail: true).toJson(), {'email': null});
    expect(ProfileUpdate(name: 'أ' * 120).toJson()['name'], hasLength(120));
    final email = '${'a' * 148}@example.com';
    expect(ProfileUpdate(email: email).toJson()['email'], hasLength(160));
    for (final input in [
      const ProfileUpdate(),
      const ProfileUpdate(name: ''),
      const ProfileUpdate(name: '  '),
      ProfileUpdate(name: 'أ' * 121),
      const ProfileUpdate(email: 'bad'),
      const ProfileUpdate(email: ''),
      ProfileUpdate(email: 'a$email'),
      const ProfileUpdate(email: 'ali@example.com', clearEmail: true),
    ]) {
      expect(
        input.toJson,
        throwsA(
          isA<AppFailure>().having(
            (e) => e.kind,
            'kind',
            FailureKind.validation,
          ),
        ),
      );
    }
  });

  test(
    'mock updates persist through GET me and same-phone login, isolated by phone',
    () async {
      final repo = AuthRepositoryMock(delay: Duration.zero);
      await expectLater(
        repo.updateProfile(const ProfileUpdate(name: 'Ali')),
        throwsA(isA<AppFailure>()),
      );
      final signedIn = await repo.verifyOtp(
        phone: '07700000002',
        code: '123456',
      );
      final saved = await repo.updateProfile(
        const ProfileUpdate(name: 'Ali', email: 'ali@example.com'),
      );
      expect(saved.phone, signedIn.user!.phone);
      expect(saved.role, signedIn.user!.role);
      expect(saved.permissions, signedIn.user!.permissions);
      expect((await repo.currentUser()).email, 'ali@example.com');
      await repo.verifyOtp(phone: '07700000000', code: '123456');
      expect((await repo.currentUser()).email, isNull);
      await repo.verifyOtp(phone: '07700000002', code: '123456');
      expect((await repo.currentUser()).name, 'Ali');
      expect((await repo.currentUser()).email, 'ali@example.com');
      await repo.updateProfile(const ProfileUpdate(clearEmail: true));
      expect((await repo.currentUser()).email, isNull);
      expect((await repo.currentUser()).name, 'Ali');
    },
  );

  test(
    'remote PATCH uses only supplied contract fields and decodes saved email',
    () async {
      final requests = <RequestOptions>[];
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            requests.add(options);
            handler.resolve(
              Response(
                requestOptions: options,
                statusCode: 200,
                data: {
                  'id': 'u1',
                  'name': 'Canonical name',
                  'phone': '07700000000',
                  'email': options.data['email'],
                  'role': 'customer',
                  'permissions': <String>[],
                },
              ),
            );
          },
        ),
      );
      final repo = AuthRepositoryRemote(ApiClient(dio));
      final saved = await repo.updateProfile(
        const ProfileUpdate(email: ' ali@example.com '),
      );
      expect(saved.name, 'Canonical name');
      expect(saved.email, 'ali@example.com');
      expect(requests.single.method, 'PATCH');
      expect(requests.single.path, '/me');
      expect(requests.single.data, {'email': 'ali@example.com'});
      await repo.updateProfile(const ProfileUpdate(clearEmail: true));
      expect(requests.last.data, {'email': null});
      expect(User.fromJson({'name': 'Legacy'}).email, isNull);
      expect(saved.copyWith(name: 'Other').email, 'ali@example.com');
    },
  );

  for (final (status, kind) in [
    (401, FailureKind.unauthorized),
    (422, FailureKind.validation),
  ]) {
    test('remote maps $status without manufacturing success', () async {
      final dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (options, handler) {
            handler.reject(
              DioException(
                requestOptions: options,
                type: DioExceptionType.badResponse,
                response: Response(
                  requestOptions: options,
                  statusCode: status,
                  data: {'message': 'Rejected'},
                ),
              ),
            );
          },
        ),
      );
      await expectLater(
        AuthRepositoryRemote(
          ApiClient(dio),
        ).updateProfile(const ProfileUpdate(name: 'Ali')),
        throwsA(isA<AppFailure>().having((e) => e.kind, 'kind', kind)),
      );
    });
  }
}
