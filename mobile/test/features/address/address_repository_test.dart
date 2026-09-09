import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:shubayr/core/network/api_client.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_mock.dart';
import 'package:shubayr/features/address/data/address_repository_remote.dart';

void main() {
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
      const AddressInput(city: 'البصرة', isDefault: true),
    );
    list = (await repo.fetchAddresses()).data;
    expect(list.length, 11);
    expect(list.firstWhere((a) => a.id == firstId).isDefault, isFalse);
    expect(list.firstWhere((a) => a.id == created.id).isDefault, isTrue);

    // Editing the first back to default clears the second.
    await repo.updateAddress(
      firstId,
      const AddressInput(city: 'بغداد', isDefault: true),
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
