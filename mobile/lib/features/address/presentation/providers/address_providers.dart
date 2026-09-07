import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/address.dart';
import '../../data/address_repository_mock.dart';
import '../../data/address_repository_remote.dart';
import '../../domain/address_repository.dart';

/// Mock ⇄ remote switch for addresses.
final addressRepositoryProvider = Provider<AddressRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => AddressRepositoryMock(),
    DataSource.remote => AddressRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// The user's saved addresses. Loads while signed in, empty for a guest; every
/// mutation re-reads the list so the single-default invariant stays correct.
class AddressesController extends AsyncNotifier<List<Address>> {
  @override
  Future<List<Address>> build() async {
    final signedIn = ref.watch(
      sessionControllerProvider.select(
        (s) => s.valueOrNull?.isSignedIn ?? false,
      ),
    );
    if (!signedIn) return const [];
    return ref.read(addressRepositoryProvider).fetchAddresses();
  }

  AddressRepository get _repo => ref.read(addressRepositoryProvider);

  Future<void> add(AddressInput input) =>
      _mutate(() => _repo.createAddress(input));

  Future<void> edit(String id, AddressInput input) =>
      _mutate(() => _repo.updateAddress(id, input));

  Future<void> remove(String id) => _mutate(() => _repo.deleteAddress(id));

  Future<void> setDefault(Address address) =>
      _mutate(() => _repo.updateAddress(address.id, address.toInput(isDefault: true)));

  Future<void> _mutate(Future<void> Function() op) async {
    state = await AsyncValue.guard(() async {
      await op();
      return _repo.fetchAddresses();
    });
  }
}

final addressesControllerProvider =
    AsyncNotifierProvider<AddressesController, List<Address>>(
      AddressesController.new,
    );
