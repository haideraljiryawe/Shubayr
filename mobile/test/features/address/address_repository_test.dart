import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:shubayr/core/error/failure.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_mock.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';

void main() {
  test(
    'Mock requires and normalizes an actual contact; API serialization remains unchanged',
    () async {
      final repo = AddressRepositoryMock(delay: Duration.zero);
      for (final phone in [null, '', 'bad']) {
        await expectLater(
          repo.createAddress(
            AddressInput(city: 'Baghdad', contactPhone: phone),
          ),
          throwsA(isA<AppFailure>()),
        );
        await expectLater(
          repo.updateAddress(
            'addr-0',
            AddressInput(city: 'Baghdad', contactPhone: phone),
          ),
          throwsA(isA<AppFailure>()),
        );
      }
      final saved = await repo.createAddress(
        const AddressInput(city: 'Baghdad', contactPhone: '٠٧٨١ ٢٣٤ ٥٦٧٨'),
      );
      expect(saved.contactPhone, '07812345678');
      expect(saved.toInput().contactPhone, saved.contactPhone);
      expect(saved.toInput().toJson().containsKey('contact_phone'), isFalse);
      expect(
        Address.fromJson({'id': 'legacy', 'city': 'Baghdad'}).contactPhone,
        isNull,
      );
      expect(
        (await repo.fetchAddresses()).data.every((a) => a.contactPhone != null),
        isTrue,
      );
    },
  );

  test(
    'remote rejects unsupported contact writes before sending any request',
    () async {
      var requests = 0;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              requests++;
              handler.reject(DioException(requestOptions: options));
            },
          ),
        );
      addTearDown(dio.close);
      final remote = AddressRepositoryRemote(ApiClient(dio));
      const input = AddressInput(city: 'Baghdad', contactPhone: '07700000000');
      await expectLater(remote.createAddress(input), throwsUnsupportedError);
      await expectLater(
        remote.updateAddress('a', input),
        throwsUnsupportedError,
      );
      expect(requests, 0);
    },
  );

  test('mock returns stable pages with total and paging metadata', () async {
    final repo = AddressRepositoryMock(delay: Duration.zero);
    final first = await repo.fetchAddresses(perPage: 8);
    final last = await repo.fetchAddresses(page: 2, perPage: 8);
    expect(first.data, hasLength(8));
    expect(last.data.map((a) => a.id), ['addr-8', 'addr-9']);
    expect(last.page, 2);
    expect(last.perPage, 8);
    expect(last.total, 10);
    expect((await repo.fetchAddresses(page: 3, perPage: 8)).data, isEmpty);
  });

  test(
    'remote forwards both page parameters and preserves response metadata',
    () async {
      late RequestOptions request;
      final dio = Dio()
        ..interceptors.add(
          InterceptorsWrapper(
            onRequest: (options, handler) {
              request = options;
              handler.resolve(
                Response(
                  requestOptions: options,
                  statusCode: 200,
                  data: {
                    'page': 2,
                    'per_page': 8,
                    'total': 9,
                    'data': [
                      {'id': 'later', 'city': 'Baghdad', 'is_default': true},
                    ],
                  },
                ),
              );
            },
          ),
        );
      addTearDown(dio.close);
      final page = await AddressRepositoryRemote(
        ApiClient(dio),
      ).fetchAddresses(page: 2, perPage: 8);
      expect(request.path, '/addresses');
      expect(request.queryParameters, {'page': 2, 'per_page': 8});
      expect(page.page, 2);
      expect(page.perPage, 8);
      expect(page.total, 9);
      expect(page.data.single.isDefault, isTrue);
    },
  );

  test('creates, edits, deletes and keeps a single default', () async {
    final repo = AddressRepositoryMock(delay: Duration.zero);

    // Ten addresses include exactly one default.
    var list = (await repo.fetchAddresses()).data;
    expect(list.length, 10);
    expect(list.where((a) => a.isDefault), hasLength(1));
    final firstId = list.first.id;

    // Adding a second default clears the first.
    final created = await repo.createAddress(
      const AddressInput(
        contactPhone: '07700000000',
        city: 'البصرة',
        isDefault: true,
      ),
    );
    list = (await repo.fetchAddresses()).data;
    expect(list.length, 11);
    expect(list.firstWhere((a) => a.id == firstId).isDefault, isFalse);
    expect(list.firstWhere((a) => a.id == created.id).isDefault, isTrue);

    // Editing the first back to default clears the second.
    await repo.updateAddress(
      firstId,
      const AddressInput(
        contactPhone: '07700000000',
        city: 'بغداد',
        isDefault: true,
      ),
    );
    list = (await repo.fetchAddresses()).data;
    expect(list.firstWhere((a) => a.id == firstId).isDefault, isTrue);
    expect(list.firstWhere((a) => a.id == created.id).isDefault, isFalse);

    // Deleting removes it.
    await repo.deleteAddress(created.id);
    list = (await repo.fetchAddresses()).data;
    expect(list.length, 10);
    expect(list.first.id, firstId);
  });
}
