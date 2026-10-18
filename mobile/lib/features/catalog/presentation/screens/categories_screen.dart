import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../providers/catalog_providers.dart';
import '../widgets/category_card.dart';

/// The same department cards wrap into rows when their local space allows.
class CategoriesScreen extends ConsumerWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: Text(context.l10n.mainCategoriesTitle)),
      body: ResponsiveContent.page(
        child: SafeArea(
          top: false,
          bottom: BottomNavigationInset.of(context) == 0,
          child: AsyncValueView(
            value: ref.watch(categoriesProvider),
            onRetry: () => ref.invalidate(categoriesProvider),
            loading: ResponsiveCardList(
              padding: AppLayout.scrollInsets(context),
              minItemWidth: AppLayout.categoryCardMinWidth,
              itemCount: 4,
              itemBuilder: (_, _) => const CategoryCardSkeleton(),
            ),
            builder: (context, list) {
              if (list.isEmpty) return const AppEmptyView();
              return ResponsiveCardList(
                padding: AppLayout.scrollInsets(context),
                minItemWidth: AppLayout.categoryCardMinWidth,
                itemCount: list.length,
                itemKeyBuilder: (i) => list[i].id,
                itemBuilder: (context, index) {
                  final category = list[index];
                  return CategoryCard(
                    key: ValueKey('cat-card-${category.id}'),
                    category: category,
                    description: category.localizedDescription(
                      Localizations.localeOf(context).languageCode,
                    ),
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
      ),
    );
  }
}
