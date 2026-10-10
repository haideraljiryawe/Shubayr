import 'package:flutter/material.dart';

import '../theme/theme_context.dart';
import '../theme/tokens/app_spacing.dart';

enum AppButtonVariant { primary, secondary, plain }

/// The app's button. Visual styling lives in the theme; this widget only adds
/// the things Material buttons lack: a busy state and a full-width option.
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final IconData? icon;
  final bool isLoading;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;
    final child = isLoading
        ? _Spinner(variant: variant)
        : _Label(label: label, icon: icon);

    final button = switch (variant) {
      AppButtonVariant.primary => ElevatedButton(
        onPressed: enabled ? onPressed : null,
        child: child,
      ),
      AppButtonVariant.secondary => OutlinedButton(
        onPressed: enabled ? onPressed : null,
        child: child,
      ),
      AppButtonVariant.plain => TextButton(
        onPressed: enabled ? onPressed : null,
        child: child,
      ),
    };

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

class _Label extends StatelessWidget {
  const _Label({required this.label, this.icon});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    if (icon == null) return Text(label);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18),
        const SizedBox(width: AppSpacing.sm),
        Flexible(child: Text(label)),
      ],
    );
  }
}

class _Spinner extends StatelessWidget {
  const _Spinner({required this.variant});

  final AppButtonVariant variant;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return SizedBox(
      height: 20,
      width: 20,
      child: CircularProgressIndicator(
        strokeWidth: 2,
        color: variant == AppButtonVariant.primary
            ? colors.onPrimary
            : colors.primaryDark,
      ),
    );
  }
}
