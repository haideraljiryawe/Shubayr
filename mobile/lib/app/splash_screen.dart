import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/theme_context.dart';
import '../core/widgets/brand_mark.dart';
import '../features/settings/presentation/providers/settings_providers.dart';

/// Shown only while the stored session is being restored.
///
/// It is not a timed splash: the router leaves it the moment the session
/// resolves. Warm off-white ground, centred store mark, nothing else.
class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = ref.watch(brandProvider);
    return Scaffold(
      backgroundColor: context.colors.background,
      body: Center(child: BrandMark(brand: brand, size: 88)),
    );
  }
}
