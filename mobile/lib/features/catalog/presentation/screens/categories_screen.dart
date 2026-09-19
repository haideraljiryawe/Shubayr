import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../providers/catalog_providers.dart';
import '../widgets/category_card.dart';

/// Top-level departments; each card opens its own child-category page.
class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isMock = ref.watch(dataSourceProvider) == DataSource.mock;
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.mainCategoriesTitle)),
      body: SafeArea(
        top: false,
        child: AsyncValueView(
          value: ref.watch(categoriesProvider),
          onRetry: () => ref.invalidate(categoriesProvider),
          loading: ListView.separated(
            padding: AppLayout.pageInsets(context),
            itemCount: 4,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (_, _) => const CategoryCardSkeleton(),
          ),
          builder: (context, list) {
            if (list.isEmpty) return const AppEmptyView();
            return ListView.separated(
              padding: AppLayout.pageInsets(context),
              itemCount: list.length,
              separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
              itemBuilder: (context, index) {
                final category = list[index];
                return CategoryCard(
                  key: ValueKey('cat-card-${category.id}'),
                  category: category,
                  legacyMockArtwork: isMock,
                  description: isMock
                      ? category.localizedDescription(
                          Localizations.localeOf(context).languageCode,
                        )
                      : null,
                  onTap: () => context.pushNamed(
                    AppRoutes.subcategoriesName,
                    pathParameters: {'categoryId': category.id},
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
