import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/domain/permissions.dart';
import '../../../auth/presentation/providers/auth_providers.dart';

/// One admin section entry, gated by a single RBAC permission.
typedef _Section = ({
  IconData icon,
  String Function(BuildContext) label,
  String permission,
});

/// Admin / staff dashboard (also the Flutter Web target).
///
/// The grid is built from the signed-in user's `permissions`, so a store
/// manager, a warehouse worker and a full admin each see a different set of
/// sections from the same screen — RBAC rule #3, enforced in the UI. The
/// catalog, people, suppliers and warehouse selection screens implement the
/// first admin increment; other sections remain pending.
class AdminHomeScreen extends ConsumerWidget {
  const AdminHomeScreen({super.key});

  static final List<_Section> _sections = [
    (
      icon: Icons.category_outlined,
      label: (c) => c.l10n.adminSectionCatalog,
      permission: Permissions.catalogManage,
    ),
    (
      icon: Icons.receipt_long_outlined,
      label: (c) => c.l10n.adminSectionOrders,
      permission: Permissions.ordersView,
    ),
    (
      icon: Icons.inventory_2_outlined,
      label: (c) => c.l10n.adminSectionInventory,
      permission: Permissions.inventoryView,
    ),
    (
      icon: Icons.checklist_outlined,
      label: (c) => c.l10n.adminSectionPicking,
      permission: Permissions.inventoryPick,
    ),
    (
      icon: Icons.local_shipping_outlined,
      label: (c) => c.l10n.adminSectionPurchasing,
      permission: Permissions.purchasingView,
    ),
    (
      icon: Icons.assignment_return_outlined,
      label: (c) => c.l10n.adminSectionReturns,
      permission: Permissions.returnsView,
    ),
    (
      icon: Icons.bar_chart_outlined,
      label: (c) => c.l10n.adminSectionReports,
      permission: Permissions.reportsView,
    ),
    (
      icon: Icons.group_outlined,
      label: (c) => c.l10n.adminSectionUsers,
      permission: Permissions.usersManage,
    ),
    (
      icon: Icons.settings_outlined,
      label: (c) => c.l10n.adminSectionSettings,
      permission: Permissions.settingsManage,
    ),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final held = ref.watch(permissionsProvider);
    final visible = _sections
        .where((s) => held.contains(s.permission))
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.adminTitle),
        actions: [
          IconButton(
            onPressed: () => context.push(AppRoutes.settings),
            icon: const Icon(Icons.person_outline),
            tooltip: context.l10n.accountTitle,
          ),
        ],
      ),
      body: visible.isEmpty
          ? AppEmptyView(
              icon: Icons.lock_outline,
              message: context.l10n.adminNoAccess,
            )
          : GridView.count(
              crossAxisCount: 2,
              padding: const EdgeInsets.all(AppSpacing.screenH),
              mainAxisSpacing: AppSpacing.md,
              crossAxisSpacing: AppSpacing.md,
              childAspectRatio: 1.3,
              children: [
                for (final s in visible)
                  _SectionTile(
                    icon: s.icon,
                    label: s.label(context),
                    onTap: () {
                      final route = switch (s.permission) {
                        Permissions.catalogManage => AppRoutes.adminCatalog,
                        Permissions.usersManage => AppRoutes.adminUsers,
                        Permissions.purchasingView => '/admin/manage/suppliers',
                        Permissions.inventoryView => '/admin/manage/warehouses',
                        _ => null,
                      };
                      if (route != null) {
                        context.push(route);
                      } else {
                        showAppSnackBarMessage(
                          context,
                          message: context.l10n.comingSoonTitle,
                        );
                      }
                    },
                  ),
              ],
            ),
    );
  }
}

class _SectionTile extends StatelessWidget {
  const _SectionTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Material(
      color: colors.surface,
      borderRadius: AppRadii.lgAll,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: AppRadii.lgAll,
            border: Border.all(color: colors.border),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 30, color: colors.primary),
              const SizedBox(height: AppSpacing.sm),
              Text(
                label,
                textAlign: TextAlign.center,
                style: context.text.titleSmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
