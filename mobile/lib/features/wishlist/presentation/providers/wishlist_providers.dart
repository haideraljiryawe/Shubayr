import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../data/wishlist_item.dart';
import '../../data/wishlist_repository_mock.dart';
import '../../data/wishlist_repository_remote.dart';
import '../../domain/wishlist_repository.dart';

/// Mock ⇄ remote switch for the wishlist.
final wishlistRepositoryProvider = Provider<WishlistRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => WishlistRepositoryMock(),
    DataSource.remote => WishlistRepositoryRemote(ref.watch(apiClientProvider)),
  };
});

/// Owns the saved products. Loads from the server while signed in and is empty
/// for a guest; every mutation re-reads the server's truth.
class WishlistController extends AsyncNotifier<List<WishlistItem>> {
  @override
  Future<List<WishlistItem>> build() async {
    final signedIn = ref.watch(
      sessionControllerProvider.select(
        (s) => s.valueOrNull?.isSignedIn ?? false,
      ),
    );
    if (!signedIn) return const [];
    return (await ref.read(wishlistRepositoryProvider).fetchWishlist()).data;
  }

  bool isWishlisted(String productId) =>
      state.valueOrNull?.any((w) => w.productId == productId) ?? false;

  Future<void> add(String productId) =>
      _run((r) => r.add(productId).then((_) {}));

  Future<void> remove(String productId) => _run((r) => r.remove(productId));

  Future<void> toggle(String productId) =>
      isWishlisted(productId) ? remove(productId) : add(productId);

  Future<void> _run(Future<void> Function(WishlistRepository) op) async {
    final repo = ref.read(wishlistRepositoryProvider);
    state = await AsyncValue.guard(() async {
      await op(repo);
      return (await repo.fetchWishlist()).data;
    });
  }
}

final wishlistControllerProvider =
    AsyncNotifierProvider<WishlistController, List<WishlistItem>>(
      WishlistController.new,
    );

/// Whether a given product is in the wishlist — a narrow view so a heart button
/// only rebuilds when its own product's membership changes.
final isWishlistedProvider = Provider.autoDispose.family<bool, String>(
  (ref, productId) => ref.watch(
    wishlistControllerProvider.select(
      (s) => s.valueOrNull?.any((w) => w.productId == productId) ?? false,
    ),
  ),
);
