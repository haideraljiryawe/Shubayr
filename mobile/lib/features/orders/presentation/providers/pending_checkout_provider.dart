import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/storage/pending_request_store.dart';
import 'order_providers.dart';

final pendingCheckoutSlotProvider = Provider<String?>((ref) {
  final identity = ref.watch(ordersIdentityProvider);
  if (identity == null) return null;
  return PendingRequestStore.slot(
    ref.watch(appConfigProvider).apiBaseUrl,
    identity.customerId,
    'checkout',
    'order',
  );
});

/// Durable across process restarts, private to one API/account, refreshed after
/// every checkout attempt. A read error must never authorize a new operation.
final pendingCheckoutProvider = FutureProvider.autoDispose<PendingRequest?>((
  ref,
) {
  final slot = ref.watch(pendingCheckoutSlotProvider);
  if (slot == null) return null;
  return ref.watch(pendingRequestStoreProvider).read(slot);
});
