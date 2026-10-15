import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/error/failure.dart';
import '../../../address/data/address.dart';
import '../../../cart/data/cart.dart';
import '../../../cart/presentation/providers/cart_providers.dart';

/// Quotes are scoped to the selected address, cart snapshot and login. Changes
/// dispose the former read; a stale price cannot enable the placement button.
final checkoutPricingProvider = FutureProvider.autoDispose
    .family<Cart, Address>((ref, address) async {
      ref.watch(cartSessionIdentityProvider);
      final cart = ref.watch(cartControllerProvider);
      if (cart.isLoading || cart.hasError || !cart.hasValue) {
        throw const AppFailure(FailureKind.validation);
      }
      if (address.governorateId == null || address.governorateId!.isEmpty) {
        throw const AppFailure(
          FailureKind.conflict,
          code: 'ADDRESS_GOVERNORATE_REQUIRED',
        );
      }
      return ref.watch(cartRepositoryProvider).fetchCart(addressId: address.id);
    });
