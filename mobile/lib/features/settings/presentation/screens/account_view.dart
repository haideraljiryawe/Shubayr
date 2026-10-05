import '../../../notifications/presentation/notification_button.dart';
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
import '../../../../core/widgets/user_avatar.dart';
import '../../../../core/utils/validators.dart';
import '../../../auth/domain/session.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../providers/settings_providers.dart';

/// Account & app-settings panel.
///
/// Reachable by everyone — a guest sees a sign-in prompt plus the app
/// preferences (language, appearance) and support links, because those are
/// device settings, not account data. Shared by the customer "Account" tab and
/// the delivery/monitor areas.
class AccountView extends ConsumerWidget {
  const AccountView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final session = ref.watch(sessionControllerProvider).value;
    final isSignedIn = session?.isSignedIn ?? false;

    return ListView(
      padding: AppLayout.scrollInsets(context),
      children: [
        ResponsiveContent(
          alignment: AlignmentDirectional.topStart,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
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
                        leading: const Icon(Icons.notifications_outlined),
                        title: Text(l10n.notificationsTitle),
                        trailing: const NotificationButton(),
                        onTap: () => context.push(AppRoutes.notifications),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  if (isSignedIn && session?.role == UserRole.customer) ...[
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
                        subtitle: const Text(
                          'Tokens · components · light/dark',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push(AppRoutes.design),
                      ),
                    ),
                  ],
                  if (isSignedIn) ...[
                    const SizedBox(height: AppSpacing.lg),
                    const _AccountActions(),
                  ],
                ],
              ),
            ],
          ),
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

/// Read-only identity, using the same session as the profile editor.
class _ProfileCard extends StatelessWidget {
  const _ProfileCard({required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final user = session.user!;
    final roleLabel = switch (session.role) {
      UserRole.delivery => l10n.roleDelivery,
      UserRole.monitor => l10n.roleMonitor,
      _ => l10n.roleCustomer,
    };
    final identity = Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          user.name?.trim().isNotEmpty == true
              ? user.name!
              : l10n.accountNoName,
          textAlign: TextAlign.center,
          style: context.text.titleLarge,
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          user.phone?.trim().isNotEmpty == true
              ? Validators.foldDigits(user.phone!)
              : l10n.accountNoPhone,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
          style: context.text.bodyLarge,
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          user.email?.trim().isNotEmpty == true
              ? user.email!
              : l10n.accountNoEmail,
          textAlign: TextAlign.center,
          style: context.text.bodyLarge?.copyWith(
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          l10n.accountSignedInAs(roleLabel),
          textAlign: TextAlign.center,
          style: context.text.bodyMedium?.copyWith(
            color: context.colors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: l10n.accountEditProfile,
          variant: AppButtonVariant.secondary,
          expand: false,
          icon: Icons.edit_outlined,
          onPressed: () => context.pushNamed(AppRoutes.profileName),
        ),
      ],
    );
    return AppCard(
      key: const ValueKey('account-summary'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Center(child: UserAvatar()),
          const SizedBox(height: AppSpacing.lg),
          identity,
        ],
      ),
    );
  }
}

class _AccountActions extends ConsumerStatefulWidget {
  const _AccountActions();

  @override
  ConsumerState<_AccountActions> createState() => _AccountActionsState();
}

class _AccountActionsState extends ConsumerState<_AccountActions> {
  Future<void> _signOut() async {
    await ref.read(sessionControllerProvider.notifier).signOut();
    if (!mounted) return;
    // Land on the public home rather than letting the guard bounce a now-guest
    // to the sign-in screen from this pushed route.
    context.go(AppRoutes.home);
  }

  Future<void> _confirmSignOut() async {
    final l10n = context.l10n;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.accountSignOutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(l10n.actionCancel),
          ),
          AppButton(
            key: const ValueKey('confirm-sign-out'),
            label: l10n.authSignOut,
            expand: false,
            onPressed: () => Navigator.pop(dialogContext, true),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) await _signOut();
  }

  Future<void> _confirmDelete() async {
    final l10n = context.l10n;
    final colors = context.colors;
    var acknowledged = false;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(l10n.profileDeleteTitle),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l10n.profileDeleteMessage),
                const SizedBox(height: AppSpacing.md),
                CheckboxListTile(
                  key: const ValueKey('acknowledge-delete'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: acknowledged,
                  onChanged: (value) =>
                      setDialogState(() => acknowledged = value ?? false),
                  title: Text(l10n.accountDeleteAcknowledgement),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: Text(l10n.actionCancel),
            ),
            TextButton(
              key: const ValueKey('confirm-delete'),
              onPressed: acknowledged
                  ? () => Navigator.pop(dialogContext, true)
                  : null,
              style: TextButton.styleFrom(foregroundColor: colors.danger),
              child: Text(l10n.profileDeleteAccount),
            ),
          ],
        ),
      ),
    );
    if (confirmed == true && mounted) {
      // Account deletion has no endpoint in the contract yet; keep it honest.
      showAppSnackBarMessage(context, message: l10n.comingSoonTitle);
    }
  }

  @override
  Widget build(BuildContext context) => AppCard(
    padding: EdgeInsets.zero,
    child: Column(
      children: [
        ListTile(
          key: const ValueKey('account-sign-out'),
          leading: const Icon(Icons.logout),
          title: Text(context.l10n.authSignOut),
          onTap: _confirmSignOut,
        ),
        const Divider(height: AppSpacing.xxs),
        ListTile(
          key: const ValueKey('account-delete'),
          leading: Icon(Icons.delete_outline, color: context.colors.danger),
          title: Text(
            context.l10n.profileDeleteAccount,
            style: TextStyle(color: context.colors.danger),
          ),
          onTap: _confirmDelete,
        ),
      ],
    ),
  );
}

/// Guest header: a sign-in prompt over the settings below it.
class _SignInCard extends StatelessWidget {
  const _SignInCard();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppCard(
      key: const ValueKey('account-guest-summary'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const UserAvatar(),
          const SizedBox(height: AppSpacing.lg),
          Text(
            l10n.authGuest,
            textAlign: TextAlign.center,
            style: context.text.titleMedium,
          ),
          const SizedBox(height: AppSpacing.xxs),
          Text(
            l10n.accountGuestPrompt,
            textAlign: TextAlign.center,
            style: context.text.bodyMedium?.copyWith(
              color: context.colors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: l10n.authSignInTitle,
            icon: Icons.login,
            expand: false,
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
