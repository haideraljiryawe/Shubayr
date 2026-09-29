import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router/app_routes.dart';
import '../layout/app_layout.dart';
import '../l10n/l10n_context.dart';
import '../../features/auth/domain/user_role.dart';
import '../../features/auth/presentation/providers/auth_providers.dart';

/// Page-level title/back/actions only. The wideHeader application identity lives
/// above the Navigator in MonitorFrame. Monitors have no customer account tab, so
/// compact layouts keep the existing account action on work pages.
AppBar workAppBar(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  bool showAccountAction = true,
}) {
  final monitor =
      ref.watch(sessionControllerProvider).value?.role == UserRole.monitor;
  final wideHeader = AppLayout.usesWideHeader(context);
  return AppBar(
    key: const ValueKey('work-page-header'),
    title: Text(title),
    centerTitle: wideHeader ? false : null,
    actions: [
      if (monitor && !wideHeader && showAccountAction)
        IconButton(
          key: const ValueKey('work-account-action'),
          onPressed: () => context.push(AppRoutes.settings),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
    ],
  );
}
