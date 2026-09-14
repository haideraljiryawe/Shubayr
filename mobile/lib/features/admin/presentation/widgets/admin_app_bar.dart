import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';

/// Page-level title/back/actions only. The desktop application identity lives
/// above the Navigator in AdminFrame. Staff have no customer account tab, so
/// compact layouts keep the existing account action on every admin page.
AppBar adminAppBar(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  bool showAccountAction = true,
}) {
  final staff =
      ref.watch(sessionControllerProvider).value?.role == UserRole.staff;
  final desktop = AppLayout.isDesktop(context);
  return AppBar(
    key: const ValueKey('admin-page-header'),
    title: Text(title),
    centerTitle: desktop ? false : null,
    actions: [
      if (staff && !desktop && showAccountAction)
        IconButton(
          key: const ValueKey('admin-mobile-account-action'),
          onPressed: () => context.push(AppRoutes.settings),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
    ],
  );
}
