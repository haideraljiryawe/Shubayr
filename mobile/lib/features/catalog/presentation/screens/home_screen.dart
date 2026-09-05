import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/settings_providers.dart';

/// Customer home.
///
/// Intentionally a placeholder: the catalog is the next feature phase. The
/// screen already reads its title from the white-label brand, and the
/// skeleton/empty/error primitives it will use exist in `core/widgets/`.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = ref.watch(brandProvider);
    return Scaffold(
      appBar: AppBar(title: Text(brand.name ?? context.l10n.storeFallbackName)),
      body: const ComingSoonView(icon: Icons.storefront_outlined),
    );
  }
}
