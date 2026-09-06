import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/config/app_config.dart';
import '../../../../core/network/api_client.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../data/order_repository_mock.dart';
import '../../data/order_repository_remote.dart';
import '../../domain/order_repository.dart';

/// Mock ⇄ remote switch for checkout (coupons + order placement). The mock
/// reads and clears the cart, so it takes the cart repository.
final orderRepositoryProvider = Provider<OrderRepository>((ref) {
  return switch (ref.watch(dataSourceProvider)) {
    DataSource.mock => OrderRepositoryMock(ref.watch(cartRepositoryProvider)),
    DataSource.remote => OrderRepositoryRemote(ref.watch(apiClientProvider)),
  };
});
