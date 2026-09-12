import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/theme/tokens/app_typography.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../banners/presentation/providers/banner_providers.dart';
import '../../../banners/presentation/widgets/home_banners.dart';
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
    final feed = ref.watch(categoryFeedProvider(_departmentId));

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Image.asset(
              'assets/images/branding/shubayr-logo.png',
              width: AppSpacing.xxl,
              height: AppSpacing.xxl,
              fit: BoxFit.contain,
              excludeFromSemantics: true,
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              // Zain's glyphs sit above the line-box center in both locales.
              // Paint-only correction preserves all header layout metrics.
              child: Transform.translate(
                offset: const Offset(0, AppSpacing.xxs),
                child: Text(
                  l10n.homeBrandName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: AppTypography.homeBrandFontFamily,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => context.pushNamed(AppRoutes.searchName),
            iconSize: AppSpacing.xl + AppSpacing.xs,
            icon: const Icon(Icons.search),
            tooltip: l10n.searchHint,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await Future.wait([
            ref
                .refresh(categoryFeedProvider(_departmentId).future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
            ref
                .refresh(homeBannersProvider.future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
          ]);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
          children: [
            const HomeBanners(),
            const SizedBox(height: AppSpacing.sm),
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
                      padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
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
    // Content-driven height: title line height + symmetric vertical padding.
    padding: AppLayout.pageInsets(
      context,
      top: AppSpacing.sm,
      bottom: AppSpacing.sm,
    ),
    child: Align(
      alignment: AlignmentDirectional.centerStart,
      child: Text(text, style: context.text.titleMedium),
    ),
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

    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 44),
      child: categories.when(
        loading: () => const SizedBox.shrink(),
        error: (_, _) => const SizedBox.shrink(),
        data: (list) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
          child: Row(
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
        padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
        sliver: ProductGridSliver(
          itemCount: 4,
          itemBuilder: (_, _) => const ProductCardSkeleton(),
        ),
      ),
    ],
  );
}
