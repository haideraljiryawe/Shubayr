import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_mock.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/session.dart';
import 'package:shubayr/features/auth/presentation/providers/auth_providers.dart';

class AddressTestSession extends SessionController {
  @override
  Future<Session> build() async =>
      const Session.signedIn(User(id: 'customer', role: 'customer'));
  void setSession(Session next) => state = AsyncData(next);
}

typedef AddressRequest = ({int page, int perPage});

class RecordingAddresses extends AddressRepositoryMock {
  RecordingAddresses() : super(delay: Duration.zero);
  final requests = <AddressRequest>[];
  final deleted = <String>[];
  final updated = <String>[];
  final created = <AddressInput>[];
  Future<AddressPage> Function(AddressRequest)? onFetch;
  Future<void> Function(String)? onDelete;
  Future<Address> Function(AddressInput)? onCreate;

  @override
  Future<AddressPage> fetchAddresses({int page = 1, int perPage = 20}) {
    final request = (page: page, perPage: perPage);
    requests.add(request);
    return onFetch?.call(request) ??
        super.fetchAddresses(page: page, perPage: perPage);
  }

  @override
  Future<void> deleteAddress(String id) {
    deleted.add(id);
    return onDelete?.call(id) ?? super.deleteAddress(id);
  }

  @override
  Future<Address> updateAddress(String id, AddressInput input) {
    updated.add(id);
    return super.updateAddress(id, input);
  }

  @override
  Future<Address> createAddress(AddressInput input) {
    created.add(input);
    return onCreate?.call(input) ?? super.createAddress(input);
  }
}

AddressPage addressPage(
  AddressRequest request, {
  int total = 10,
  int? defaultIndex,
}) => AddressPage(
  page: request.page,
  perPage: request.perPage,
  total: total,
  data: [
    for (
      var i = (request.page - 1) * request.perPage;
      i < request.page * request.perPage && i < total;
      i++
    )
      Address(
        id: 'addr-$i',
        label: 'Address $i',
        city: 'Baghdad',
        isDefault: i == defaultIndex,
      ),
  ],
);
