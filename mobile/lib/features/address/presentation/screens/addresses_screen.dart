import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../data/address.dart';
import '../providers/address_providers.dart';

/// The user's delivery addresses: list, add, edit, delete and set-default.
/// Reached from the account page and (later) from checkout.
class AddressesScreen extends ConsumerWidget {
  const AddressesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final addresses = ref.watch(addressesControllerProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.addressesTitle)),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.pushNamed(AppRoutes.addressFormName),
        icon: const Icon(Icons.add),
        label: Text(l10n.addressAdd),
      ),
      body: AsyncValueView(
        value: addresses,
        loading: const Padding(
          padding: EdgeInsets.all(AppSpacing.screenH),
          child: SkeletonCardList(itemCount: 3),
        ),
        onRetry: () => ref.invalidate(addressesControllerProvider),
        builder: (context, list) {
          if (list.isEmpty) {
            return AppEmptyView(
              icon: Icons.location_off_outlined,
              title: l10n.addressEmptyTitle,
              message: l10n.addressEmptyMessage,
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.screenH,
              AppSpacing.screenH,
              // Room so the last card clears the floating button.
              96,
            ),
            itemCount: list.length,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
            itemBuilder: (_, i) => _AddressCard(address: list[i]),
          );
        },
      ),
    );
  }
}

class _AddressCard extends ConsumerWidget {
  const _AddressCard({required this.address});

  final Address address;

  String _lines() => [
    address.city,
    address.area,
    address.street,
    address.details,
  ].where((s) => s != null && s.trim().isNotEmpty).join('، ');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final title = address.label.isNotEmpty ? address.label : address.city;

    return AppCard(
      onTap: () => context.pushNamed(
        AppRoutes.addressFormName,
        extra: address,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.location_on_outlined, color: colors.primary),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: context.text.titleSmall,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (address.isDefault) ...[
                      const SizedBox(width: AppSpacing.sm),
                      const _DefaultBadge(),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpacing.xxs),
                Text(
                  _lines(),
                  style: context.text.bodySmall?.copyWith(
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          _AddressMenu(address: address),
        ],
      ),
    );
  }
}

class _DefaultBadge extends StatelessWidget {
  const _DefaultBadge();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.primarySoft,
        borderRadius: AppRadii.pillAll,
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: 2),
        child: Text(
          context.l10n.addressDefault,
          style: context.text.labelSmall?.copyWith(
            color: colors.primaryDark,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }
}

class _AddressMenu extends ConsumerWidget {
  const _AddressMenu({required this.address});

  final Address address;

  Future<void> _confirmDelete(BuildContext context, WidgetRef ref) async {
    final l10n = context.l10n;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.addressDeleteTitle),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(l10n.actionCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(l10n.actionDelete),
          ),
        ],
      ),
    );
    if (ok ?? false) {
      ref.read(addressesControllerProvider.notifier).remove(address.id);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    return PopupMenuButton<String>(
      icon: Icon(Icons.more_vert, color: context.colors.textMuted),
      onSelected: (value) {
        switch (value) {
          case 'default':
            ref.read(addressesControllerProvider.notifier).setDefault(address);
          case 'delete':
            _confirmDelete(context, ref);
        }
      },
      itemBuilder: (_) => [
        if (!address.isDefault)
          PopupMenuItem(value: 'default', child: Text(l10n.addressSetDefault)),
        PopupMenuItem(value: 'delete', child: Text(l10n.actionDelete)),
      ],
    );
  }
}
