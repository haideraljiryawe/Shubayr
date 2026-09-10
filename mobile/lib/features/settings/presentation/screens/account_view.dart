import '../../../../core/layout/app_layout.dart';
import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/l10n/locale_controller.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/theme/theme_mode_controller.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/brand_mark.dart';
import '../../../auth/domain/session.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../providers/settings_providers.dart';

/// Account & app-settings panel.
///
/// Reachable by everyone — a guest sees a sign-in prompt plus the app
/// preferences (language, appearance) and support links, because those are
/// device settings, not account data. Shared by the customer "Account" tab and
/// the delivery/admin areas (shown there in a sheet).
class AccountView extends ConsumerWidget {
  const AccountView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final session = ref.watch(sessionControllerProvider).valueOrNull;
    final isSignedIn = session?.isSignedIn ?? false;

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenH),
      children: [
        ResponsiveSections(
          stackedSpacing: 0,
          maxWidth: AppLayout.formWidth,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                isSignedIn
                    ? _ProfileCard(session: session!)
                    : const _SignInCard(),
                const SizedBox(height: AppSpacing.lg),
                if (isSignedIn) ...[
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: const Icon(Icons.favorite_border),
                      title: Text(l10n.wishlistTitle),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.pushNamed(AppRoutes.wishlistName),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: const Icon(Icons.location_on_outlined),
                      title: Text(l10n.addressesTitle),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.pushNamed(AppRoutes.addressesName),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ],
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SectionLabel(l10n.accountPreferences),
                const _PreferencesCard(),
                const SizedBox(height: AppSpacing.lg),
                _SectionLabel(l10n.accountSupport),
                const _SupportCard(),
                if (kDebugMode) ...[
                  const SizedBox(height: AppSpacing.lg),
                  AppCard(
                    padding: EdgeInsets.zero,
                    child: ListTile(
                      leading: const Icon(Icons.palette_outlined),
                      // Developer-only tool; labels are intentionally not localised.
                      title: const Text('Design system'),
                      subtitle: const Text('Tokens · components · light/dark'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => context.push(AppRoutes.design),
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsetsDirectional.only(
      start: AppSpacing.xs,
      bottom: AppSpacing.sm,
    ),
    child: Text(
      text,
      style: context.text.labelLarge?.copyWith(
        color: context.colors.textSecondary,
      ),
    ),
  );
}

/// Signed-in header: brand identity and the current role.
class _ProfileCard extends ConsumerWidget {
  const _ProfileCard({required this.session});

  final Session session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final roleLabel = switch (session.role) {
      UserRole.delivery => l10n.roleDelivery,
      UserRole.staff => l10n.roleStaff,
      _ => l10n.roleCustomer,
    };

    return AppCard(
      onTap: () => context.pushNamed(AppRoutes.profileName),
      child: Row(
        children: [
          BrandMark(brand: brand, size: 48),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  brand.name ?? l10n.storeFallbackName,
                  style: context.text.titleMedium,
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  l10n.accountSignedInAs(roleLabel),
                  style: context.text.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: colors.textMuted),
        ],
      ),
    );
  }
}

/// Guest header: a sign-in prompt over the settings below it.
class _SignInCard extends ConsumerWidget {
  const _SignInCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final brand = ref.watch(brandProvider);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              BrandMark(brand: brand, size: 48),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l10n.authGuest, style: context.text.titleMedium),
                    const SizedBox(height: AppSpacing.xxs),
                    Text(
                      l10n.accountGuestPrompt,
                      style: context.text.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: l10n.authSignInTitle,
            icon: Icons.login,
            onPressed: () => context.pushNamed(
              AppRoutes.signInName,
              queryParameters: {'returnTo': AppRoutes.account},
            ),
          ),
        ],
      ),
    );
  }
}

/// Language, appearance and currency — available to everyone.
class _PreferencesCard extends ConsumerWidget {
  const _PreferencesCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final locale = ref.watch(localeControllerProvider);
    final themeMode = ref.watch(themeModeControllerProvider);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.accountLanguage, style: context.text.titleSmall),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<Locale>(
            segments: [
              ButtonSegment(
                value: AppLocales.arabic,
                label: Text(l10n.accountLanguageArabic),
              ),
              ButtonSegment(
                value: AppLocales.english,
                label: Text(l10n.accountLanguageEnglish),
              ),
            ],
            selected: {locale},
            showSelectedIcon: false,
            onSelectionChanged: (selection) => ref
                .read(localeControllerProvider.notifier)
                .setLocale(selection.first),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(l10n.accountTheme, style: context.text.titleSmall),
          const SizedBox(height: AppSpacing.md),
          SegmentedButton<ThemeMode>(
            segments: [
              ButtonSegment(
                value: ThemeMode.system,
                icon: const Icon(Icons.brightness_auto_outlined),
                label: Text(l10n.accountThemeSystem),
              ),
              ButtonSegment(
                value: ThemeMode.light,
                icon: const Icon(Icons.light_mode_outlined),
                label: Text(l10n.accountThemeLight),
              ),
              ButtonSegment(
                value: ThemeMode.dark,
                icon: const Icon(Icons.dark_mode_outlined),
                label: Text(l10n.accountThemeDark),
              ),
            ],
            selected: {themeMode},
            showSelectedIcon: false,
            onSelectionChanged: (selection) => ref
                .read(themeModeControllerProvider.notifier)
                .setMode(selection.first),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(l10n.accountCurrency, style: context.text.bodyMedium),
              Text(
                brand.currencyCode,
                style: context.text.labelLarge?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Support links. The destinations arrive in a later phase; the rows exist now
/// so the settings structure (help, privacy, …) is in place.
class _SupportCard extends StatelessWidget {
  const _SupportCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    void soon() =>
        showAppSnackBarMessage(context, message: l10n.comingSoonTitle);
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.help_outline),
            title: Text(l10n.accountHelp),
            trailing: const Icon(Icons.chevron_right),
            onTap: soon,
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: Text(l10n.accountPrivacy),
            trailing: const Icon(Icons.chevron_right),
            onTap: soon,
          ),
        ],
      ),
    );
  }
}
