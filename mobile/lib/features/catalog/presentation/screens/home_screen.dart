import '../../../settings/presentation/providers/settings_providers.dart';
import '../../../../core/widgets/brand_mark.dart';
import '../../../../core/config/store_identity.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/theme/tokens/app_typography.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../banners/presentation/providers/banner_providers.dart';
import '../../../banners/presentation/widgets/home_banners.dart';
import '../../../notifications/presentation/notification_button.dart';
import '../../../notifications/presentation/notification_providers.dart';
import '../providers/catalog_providers.dart';
import '../widgets/home_category_carousel.dart';
import '../widgets/home_offers_list.dart';

/// Customer home: department navigation shortcuts above the store feed.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key, this.claimCarouselStartupDelay});

  final bool Function()? claimCarouselStartupDelay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final brand = ref.watch(brandProvider);
    final offers = ref.watch(homeOffersProvider);
    final showNotifications = ref.watch(notificationIdentityProvider).signedIn;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            BrandMark(
              brand: brand,
              size: AppSpacing.xxl,
              fallbackAsset: StoreIdentity.logoAsset,
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                brand.name ??
                    StoreIdentity.name(
                      Localizations.localeOf(context).languageCode,
                    ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontFamily: AppTypography.homeBrandFontFamily,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButtonTheme(
            data: IconButtonThemeData(
              style: IconButton.styleFrom(
                fixedSize: const Size.square(kMinInteractiveDimension),
                padding: const EdgeInsets.all(AppSpacing.sm),
                visualDensity: VisualDensity.standard,
                shape: const CircleBorder(),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  onPressed: () => context.pushNamed(AppRoutes.searchName),
                  iconSize: AppSpacing.xl + AppSpacing.xs,
                  icon: const Icon(Icons.search),
                  tooltip: l10n.searchHint,
                ),
                if (showNotifications) ...[
                  const NotificationButton(
                    iconSize: AppSpacing.xl + AppSpacing.xs,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          // Another client (such as the admin web app) may have changed the
          // catalog. Drop cached details too, so reopening a product cannot
          // resurrect the old price, category or media after this refresh.
          ref.invalidate(productProvider);
          ref.invalidate(availabilityProvider);
          ref.invalidate(categoryFeedProvider);
          ref.invalidate(offerCategoriesProvider);
          await Future.wait([
            ref
                .refresh(categoriesProvider.future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
            ref
                .refresh(homeOffersProvider.future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
            ref
                .refresh(homeBannersProvider.future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
          ]);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.only(
            bottom: AppSpacing.xxl + BottomNavigationInset.of(context),
          ),
          children: [
            const HomeBanners(),
            const SizedBox(height: AppSpacing.homeBannerToCategories),
            _DepartmentsBar(claimStartupDelay: claimCarouselStartupDelay),
            const _OffersHeader(),
            AsyncValueView(
              value: offers,
              onRetry: () => ref.invalidate(homeOffersProvider),
              loading: const HomeOffersList(),
              builder: (context, page) {
                if (page.data.isEmpty) {
                  return const SizedBox(height: 220, child: AppEmptyView());
                }
                return HomeOffersList(products: page.data);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _OffersHeader extends StatelessWidget {
  const _OffersHeader();

  @override
  Widget build(BuildContext context) => Padding(
    padding: AppLayout.pageInsets(
      context,
      top: AppSpacing.sm,
      bottom: AppSpacing.sm,
    ),
    child: Row(
      children: [
        Expanded(
          child: Text(
            context.l10n.homeOffersTitle,
            style: context.sectionTitle,
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        TextButton(
          key: const ValueKey('home-offers-view-all'),
          onPressed: () => context.pushNamed(
            AppRoutes.searchName,
            queryParameters: {'offers_only': 'true'},
          ),
          child: Text(context.l10n.homeOffersViewAll),
        ),
      ],
    ),
  );
}

/// Shortcuts navigate; they never select or filter the Home feed.
class _DepartmentsBar extends ConsumerWidget {
  const _DepartmentsBar({this.claimStartupDelay});

  final bool Function()? claimStartupDelay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final categories = ref.watch(categoriesProvider);
    final width =
        AppLayout.categoryShortcutWidth * AppLayout.textScale(context);
    Widget row(List<Widget> children) => SingleChildScrollView(
      key: const ValueKey('home-category-shortcuts'),
      scrollDirection: Axis.horizontal,
      padding: AppLayout.pageInsets(context, top: 0, bottom: 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
    return categories.when(
      loading: () => row([
        for (var i = 0; i < 4; i++)
          SizedBox(
            width: width,
            child: const Column(
              children: [
                Skeleton(
                  width: AppLayout.categoryIconTarget,
                  height: AppLayout.categoryIconTarget,
                  borderRadius: AppRadii.pillAll,
                ),
                SizedBox(height: AppSpacing.sm),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                  child: Skeleton.line(),
                ),
              ],
            ),
          ),
      ]),
      error: (_, _) => const SizedBox.shrink(),
      data: (list) => HomeCategoryCarousel(
        categories: list,
        claimStartupDelay: claimStartupDelay,
        onSelected: (category) => context.pushNamed(
          AppRoutes.searchName,
          queryParameters: {'parent_category_id': category.id},
        ),
      ),
    );
  }
}
