import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/features/address/data/address.dart';
import 'package:shubayr/features/address/data/address_repository_mock.dart';

void main() {
  test('creates, edits, deletes and keeps a single default', () async {
    final repo = AddressRepositoryMock(delay: Duration.zero);

    // Seeded with one default address.
    var list = await repo.fetchAddresses();
    expect(list.length, 1);
    expect(list.single.isDefault, isTrue);
    final firstId = list.single.id;

    // Adding a second default clears the first.
    final created = await repo.createAddress(
      const AddressInput(city: 'البصرة', isDefault: true),
    );
    list = await repo.fetchAddresses();
    expect(list.length, 2);
    expect(list.firstWhere((a) => a.id == firstId).isDefault, isFalse);
    expect(list.firstWhere((a) => a.id == created.id).isDefault, isTrue);

    // Editing the first back to default clears the second.
    await repo.updateAddress(
      firstId,
      const AddressInput(city: 'بغداد', isDefault: true),
    );
    list = await repo.fetchAddresses();
    expect(list.firstWhere((a) => a.id == firstId).isDefault, isTrue);
    expect(list.firstWhere((a) => a.id == created.id).isDefault, isFalse);

    // Deleting removes it.
    await repo.deleteAddress(created.id);
    list = await repo.fetchAddresses();
    expect(list.length, 1);
    expect(list.single.id, firstId);
  });
}
