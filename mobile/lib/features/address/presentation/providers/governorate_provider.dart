import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/api_client.dart';
import '../../data/governorate_repository.dart';

final governoratesProvider = FutureProvider.autoDispose<List<Governorate>>((
  ref,
) {
  return GovernorateRepository(ref.watch(apiClientProvider)).fetch();
});
