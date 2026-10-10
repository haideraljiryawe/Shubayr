import '../core/config/store_identity.dart';
import 'package:flutter/material.dart';

import '../core/l10n/l10n_context.dart';
import '../core/widgets/state_views.dart';
import '../core/layout/app_layout.dart';
import '../core/theme/theme_context.dart';
import '../core/theme/tokens/app_spacing.dart';
import '../core/theme/tokens/app_typography.dart';
import 'startup_assets.dart';

/// The router waits for both session readiness and the minimum display window.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.onDisplayed, this.error, this.onRetry});

  final VoidCallback? onDisplayed;
  final Object? error;
  final VoidCallback? onRetry;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onDisplayed?.call();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Scaffold(
      backgroundColor: colors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xl),
          child: LayoutBuilder(
            builder: (context, constraints) => SingleChildScrollView(
              child: ConstrainedBox(
                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(
                      maxWidth: AppLayout.authWidth,
                    ),
                    child: widget.error != null
                        ? AppErrorView(
                            error: widget.error,
                            onRetry: widget.onRetry,
                          )
                        : Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Image(
                                image: StartupAssets.logo,
                                errorBuilder: (_, _, _) =>
                                    const SizedBox.shrink(),
                                width: AppSpacing.xxxl * 2,
                                height: AppSpacing.xxxl * 2,
                                fit: BoxFit.contain,
                                excludeFromSemantics: true,
                              ),
                              const SizedBox(height: AppSpacing.sm),
                              Text(
                                StoreIdentity.name(
                                  Localizations.localeOf(context).languageCode,
                                ),
                                textAlign: TextAlign.center,
                                style: context.text.displaySmall?.copyWith(
                                  fontFamily: AppTypography.brandFontFamily,
                                  color: colors.textPrimary,
                                ),
                              ),
                              const SizedBox(height: AppSpacing.sm),
                              // Only the tagline sets this group's intrinsic width;
                              // the progress bar takes that width without stretching it.
                              IntrinsicWidth(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      context.l10n.startupTagline,
                                      textAlign: TextAlign.center,
                                      style: context.text.bodyMedium?.copyWith(
                                        color: colors.textSecondary,
                                      ),
                                    ),
                                    const SizedBox(height: AppSpacing.md),
                                    LinearProgressIndicator(
                                      minHeight: AppSpacing.xs,
                                      color: colors.primary,
                                      backgroundColor: colors.primarySoft,
                                      semanticsLabel:
                                          context.l10n.startupLoading,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
