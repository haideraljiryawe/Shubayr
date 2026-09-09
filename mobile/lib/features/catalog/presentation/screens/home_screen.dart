import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/settings_providers.dart';
import '../providers/catalog_providers.dart';
import '../widgets/product_card.dart';
import '../widgets/product_grid.dart';

/// Customer home: shop-by-department chips over a product grid. Selecting a
/// department filters the grid in place; tapping a product opens its detail.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String? _departmentId; // null = all departments

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final brand = ref.watch(brandProvider);
    final feed = ref.watch(categoryFeedProvider(_departmentId));

    return Scaffold(
      appBar: AppBar(
        title: Text(brand.name ?? l10n.storeFallbackName),
        actions: [
          IconButton(
            onPressed: () => context.pushNamed(AppRoutes.searchName),
            icon: const Icon(Icons.search),
            tooltip: l10n.searchHint,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            ref.refresh(categoryFeedProvider(_departmentId).future),
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          children: [
            _SectionTitle(l10n.homeSectionDepartments),
            _DepartmentsBar(
              selectedId: _departmentId,
              onSelected: (id) => setState(() => _departmentId = id),
            ),
            _SectionTitle(l10n.homeSectionProducts),
            AsyncValueView(
              value: feed,
              onRetry: () =>
                  ref.invalidate(categoryFeedProvider(_departmentId)),
              loading: const _GridSkeleton(),
              builder: (context, page) {
                if (page.data.isEmpty) {
                  return const SizedBox(height: 220, child: AppEmptyView());
                }
                return CustomScrollView(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  slivers: [
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.screenH,
                      ),
                      sliver: ProductGridSliver(
                        itemCount: page.data.length,
                        itemBuilder: (context, i) {
                          final product = page.data[i];
                          return ProductCard(
                            product: product,
                            onTap: () => context.pushNamed(
                              AppRoutes.productName,
                              pathParameters: {'id': product.id},
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(
      AppSpacing.screenH,
      AppSpacing.lg,
      AppSpacing.screenH,
      AppSpacing.sm,
    ),
    child: Text(text, style: context.text.titleMedium),
  );
}

/// Horizontal, scrollable list of department chips (All + top-level categories).
class _DepartmentsBar extends ConsumerWidget {
  const _DepartmentsBar({required this.selectedId, required this.onSelected});

  final String? selectedId;
  final ValueChanged<String?> onSelected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final lang = Localizations.localeOf(context).languageCode;
    final categories = ref.watch(categoriesProvider);

    return SizedBox(
      height: 44,
      child: categories.when(
        loading: () => const SizedBox.shrink(),
        error: (_, _) => const SizedBox.shrink(),
        data: (list) => ListView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
          children: [
            _Chip(
              label: l10n.homeAllDepartments,
              selected: selectedId == null,
              onTap: () => onSelected(null),
            ),
            for (final c in list)
              _Chip(
                label: c.localizedName(lang),
                selected: selectedId == c.id,
                onTap: () => onSelected(c.id),
              ),
          ],
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
    child: ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(),
    ),
  );
}

class _GridSkeleton extends StatelessWidget {
  const _GridSkeleton();

  @override
  Widget build(BuildContext context) => CustomScrollView(
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    slivers: [
      SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenH),
        sliver: ProductGridSliver(
          itemCount: 4,
          itemBuilder: (_, _) => const ProductCardSkeleton(),
        ),
      ),
    ],
  );
}
