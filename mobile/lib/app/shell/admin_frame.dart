import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/layout/app_layout.dart';
import '../../core/l10n/l10n_context.dart';
import '../../core/theme/theme_context.dart';
import '../../core/theme/tokens/app_spacing.dart';
import '../../core/theme/tokens/app_typography.dart';
import '../../features/auth/domain/user_role.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';
import '../router/app_routes.dart';

/// Presentation above the existing Router/Navigator. Its header remains mounted
/// while pages, imperative forms and page transitions change underneath it.
/// No route, navigator key or navigation stack changes are needed.
class AdminFrame extends ConsumerStatefulWidget {
  const AdminFrame({super.key, required this.router, required this.child});
  final GoRouter router;
  final Widget child;

  @override
  ConsumerState<AdminFrame> createState() => _AdminFrameState();
}

class _AdminFrameState extends ConsumerState<AdminFrame> {
  late bool _isAdminRoute;
  bool _refreshScheduled = false;

  String get _currentPath =>
      widget.router.routerDelegate.currentConfiguration.isEmpty
      ? ''
      : widget.router.state.uri.path;

  static bool _adminPath(String path) =>
      path == AppRoutes.admin ||
      path.startsWith('${AppRoutes.admin}/') ||
      path == AppRoutes.settings ||
      path == AppRoutes.profile;

  @override
  void initState() {
    super.initState();
    _isAdminRoute = _adminPath(_currentPath);
    widget.router.routerDelegate.addListener(_routeChanged);
  }

  @override
  void didUpdateWidget(AdminFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.router != widget.router) {
      oldWidget.router.routerDelegate.removeListener(_routeChanged);
      widget.router.routerDelegate.addListener(_routeChanged);
      _isAdminRoute = _adminPath(_currentPath);
    }
  }

  void _routeChanged() {
    if (!mounted ||
        _refreshScheduled ||
        _adminPath(_currentPath) == _isAdminRoute) {
      return;
    }
    // SchedulerPhase is not a build-lock signal: initial attachment and
    // reassembly can build widgets outside persistentCallbacks. Commit only
    // after the frame, coalescing notifications and reading the latest router.
    _refreshScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _refreshScheduled = false;
      if (!mounted) return;
      final isAdminRoute = _adminPath(_currentPath);
      if (isAdminRoute == _isAdminRoute) return;
      setState(() => _isAdminRoute = isAdminRoute);
    });
    // A notification can arrive while idle, with no frame pending. This asks
    // the scheduler for a frame when needed; it does not rebuild synchronously.
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  @override
  void dispose() {
    widget.router.routerDelegate.removeListener(_routeChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final staff =
        ref.watch(sessionControllerProvider).value?.role == UserRole.staff;
    final desktop = staff && AppLayout.isDesktop(context) && _isAdminRoute;
    // Keep the Router under the same keyed parent across breakpoint changes.
    return Column(
      children: [
        if (desktop)
          GlobalAdminHeader(
            onAccount: () {
              if (_currentPath != AppRoutes.settings) {
                widget.router.push(AppRoutes.settings);
              }
            },
          ),
        Expanded(
          key: const ValueKey('app-routed-content'),
          child: MediaQuery.removePadding(
            context: context,
            removeTop: desktop,
            child: widget.child,
          ),
        ),
      ],
    );
  }
}

class GlobalAdminHeader extends ConsumerWidget {
  const GlobalAdminHeader({super.key, required this.onAccount});
  final VoidCallback onAccount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final colors = context.colors;
    final name = ref.watch(sessionControllerProvider).value?.user?.name?.trim();
    return Material(
      key: const ValueKey('admin-global-header'),
      color: colors.primarySoft,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.divider)),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenH,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                Image.asset(
                  'assets/images/branding/shubayr-logo.png',
                  key: const ValueKey('admin-brand-logo'),
                  width: AppSpacing.xxl,
                  height: AppSpacing.xxl,
                  fit: BoxFit.contain,
                  excludeFromSemantics: true,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    l.homeBrandName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: context.text.titleLarge?.copyWith(
                      fontFamily: AppTypography.homeBrandFontFamily,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.lg),
                ConstrainedBox(
                  constraints: const BoxConstraints(
                    maxWidth: AppLayout.fieldMinWidth,
                  ),
                  child: TextButton(
                    key: const ValueKey('admin-account-action'),
                    style: TextButton.styleFrom(
                      foregroundColor: colors.textPrimary,
                    ),
                    onPressed: onAccount,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.account_circle_outlined),
                        const SizedBox(width: AppSpacing.sm),
                        Flexible(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                l.accountTitle,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (name != null && name.isNotEmpty)
                                Text(
                                  name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: context.text.labelSmall,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
