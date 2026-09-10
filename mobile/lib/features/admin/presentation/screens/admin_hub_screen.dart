import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../domain/admin_repository.dart';
import '../widgets/admin_labels.dart';

class AdminHubScreen extends ConsumerWidget {
  const AdminHubScreen({super.key, required this.catalog});
  final bool catalog;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resources = catalog
        ? [AdminResource.products, AdminResource.categories]
        : [AdminResource.users, AdminResource.roles];
    final session = ref.watch(sessionControllerProvider).valueOrNull;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          catalog
              ? context.l10n.adminSectionCatalog
              : context.l10n.adminSectionUsers,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.screenH),
        children: [
          ResponsiveFields(
            children: [
              for (final resource in resources)
                if (session?.can(resource.readPermission) == true)
                  Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: AppCard(
                      onTap: () =>
                          context.push('/admin/manage/${resource.name}'),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(adminTitle(context.l10n, resource)),
                          ),
                          Icon(
                            Directionality.of(context) == TextDirection.rtl
                                ? Icons.chevron_left
                                : Icons.chevron_right,
                          ),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}
