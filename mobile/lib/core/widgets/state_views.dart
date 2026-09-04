import 'package:flutter/material.dart';

import '../error/failure.dart';
import '../l10n/l10n_context.dart';
import '../theme/theme_context.dart';
import '../theme/tokens/app_radii.dart';
import '../theme/tokens/app_spacing.dart';
import 'app_button.dart';

/// Centred spinner for short, blocking waits.
class AppLoadingView extends StatelessWidget {
  const AppLoadingView({super.key});

  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(
      padding: EdgeInsets.all(AppSpacing.xxl),
      child: CircularProgressIndicator(),
    ),
  );
}

/// Shared layout for empty / error / placeholder states.
class _MessageView extends StatelessWidget {
  const _MessageView({
    required this.icon,
    required this.title,
    required this.message,
    this.iconColor,
    this.iconBackground,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Color? iconColor;
  final Color? iconBackground;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: iconBackground ?? colors.surfaceAlt,
                borderRadius: AppRadii.xlAll,
              ),
              child: Icon(icon, size: 28, color: iconColor ?? colors.textMuted),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              title,
              textAlign: TextAlign.center,
              style: context.text.titleMedium,
            ),
            if (message != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: context.text.bodySmall?.copyWith(
                  color: colors.textSecondary,
                ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: AppSpacing.xl),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

/// "There is nothing to show" — not an error.
class AppEmptyView extends StatelessWidget {
  const AppEmptyView({
    super.key,
    this.icon = Icons.inbox_outlined,
    this.title,
    this.message,
  });

  final IconData icon;
  final String? title;
  final String? message;

  @override
  Widget build(BuildContext context) => _MessageView(
    icon: icon,
    title: title ?? context.l10n.stateEmptyTitle,
    message: message ?? context.l10n.stateEmptyMessage,
  );
}

/// Failure state with a retry affordance. Copy is localised; the raw server
/// message is never shown as the headline.
class AppErrorView extends StatelessWidget {
  const AppErrorView({super.key, this.error, this.onRetry});

  final Object? error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final message = error is AppFailure
        ? (error! as AppFailure).localizedMessage(l10n)
        : l10n.errorUnknown;

    return _MessageView(
      icon: Icons.error_outline,
      iconColor: colors.danger,
      iconBackground: colors.danger.withValues(alpha: 0.08),
      title: l10n.stateErrorTitle,
      message: message,
      action: onRetry == null
          ? null
          : AppButton(
              label: l10n.actionRetry,
              onPressed: onRetry,
              variant: AppButtonVariant.secondary,
              expand: false,
              icon: Icons.refresh,
            ),
    );
  }
}

/// Placeholder for areas that are scaffolded but intentionally not built yet.
class ComingSoonView extends StatelessWidget {
  const ComingSoonView({super.key, this.icon = Icons.construction_outlined});

  final IconData icon;

  @override
  Widget build(BuildContext context) => _MessageView(
    icon: icon,
    title: context.l10n.comingSoonTitle,
    message: context.l10n.comingSoonMessage,
  );
}
