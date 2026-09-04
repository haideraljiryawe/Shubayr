import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/l10n/locale_controller.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/brand_mark.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../providers/settings_providers.dart';

/// Account panel: brand identity, language, currency, sign out.
///
/// Shared by the customer "Account" tab and the delivery/admin areas (shown
/// there in a sheet), so there is one implementation of these controls.
class AccountView extends ConsumerWidget {
  const AccountView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final colors = context.colors;
    final brand = ref.watch(brandProvider);
    final locale = ref.watch(localeControllerProvider);
    final session = ref.watch(sessionControllerProvider).valueOrNull;

    final roleLabel = switch (session?.role) {
      UserRole.delivery => l10n.roleDelivery,
      UserRole.staff => l10n.roleStaff,
      UserRole.customer => l10n.roleCustomer,
      null => l10n.authGuest,
    };

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenH),
      children: [
        AppCard(
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
                      session == null || !session.isSignedIn
                          ? l10n.authGuest
                          : l10n.accountSignedInAs(roleLabel),
                      style: context.text.bodySmall?.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppCard(
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
        ),
        if (session != null && session.isSignedIn) ...[
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: l10n.authSignOut,
            variant: AppButtonVariant.secondary,
            icon: Icons.logout,
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).signOut(),
          ),
        ],
      ],
    );
  }
}
