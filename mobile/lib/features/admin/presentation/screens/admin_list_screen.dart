import '../widgets/admin_list_toolbar.dart';
import '../widgets/admin_app_bar.dart';
import '../../../../core/layout/app_layout.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../auth/domain/user_role.dart';
import '../../domain/admin_repository.dart';
import '../providers/admin_providers.dart';
import '../widgets/admin_labels.dart';
import 'admin_record_form.dart';

class AdminListScreen extends ConsumerStatefulWidget {
  const AdminListScreen({super.key, required this.resource, this.warehouseId});
  final AdminResource resource;
  final String? warehouseId;
  @override
  ConsumerState<AdminListScreen> createState() => _AdminListScreenState();
}

class _AdminListScreenState extends ConsumerState<AdminListScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String _query = '';
  String? _role;
  AdminQuery get query => AdminQuery(
    widget.resource,
    text: _query,
    role: _role,
    warehouseId: widget.warehouseId,
  );
  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _form([AdminRecord? record]) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AdminRecordForm(query: query, record: record),
      ),
    );
  }

  Future<void> _delete(AdminRecord record) async {
    final l = context.l10n;
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          widget.resource == AdminResource.products
              ? l.adminArchiveConfirm
              : l.adminDeleteConfirm,
        ),
        content: Text(
          record.label(Localizations.localeOf(context).languageCode),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l.actionCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.actionDelete),
          ),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    try {
      final saved = await ref
          .read(adminListProvider(query).notifier)
          .delete(record.id);
      if (saved && mounted) {
        showAppSnackBarMessage(context, message: l.adminDeleted);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackBarMessage(
          context,
          message: (error is AppFailure ? error : const AppFailure.unknown())
              .localizedMessage(l),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.resource, l = context.l10n;
    final session = ref.watch(sessionControllerProvider).value;
    final allowed =
        session?.role == UserRole.staff &&
        session?.can(r.readPermission) == true;
    if (!allowed) {
      return Scaffold(
        appBar: adminAppBar(context, ref, title: adminTitle(l, r)),
        body: AppEmptyView(icon: Icons.lock_outline, message: l.adminNoAccess),
      );
    }
    final value = ref.watch(adminListProvider(query));
    final controller = ref.read(adminListProvider(query).notifier);
    final canWrite = session?.can(r.writePermission) == true;
    void nearEnd(ScrollMetrics metrics) {
      if (metrics.axis == Axis.vertical &&
          metrics.extentAfter < metrics.viewportDimension &&
          ref.read(adminListProvider(query)).value?.appendError == null) {
        controller.loadMore();
      }
    }

    return Scaffold(
      appBar: adminAppBar(context, ref, title: adminTitle(l, r)),
      floatingActionButton:
          !AppLayout.isDesktop(context) && r.canCreate && canWrite
          ? FloatingActionButton.extended(
              onPressed: () => _form(),
              label: Text(l.adminAdd),
              icon: const Icon(Icons.add),
            )
          : null,
      body: Column(
        children: [
          AdminListToolbar(
            onAdd: r.canCreate && canWrite ? () => _form() : null,
            fields: [
              if (r.canSearch)
                TextField(
                  controller: _search,
                  textAlign: TextAlign.start,
                  decoration: InputDecoration(
                    hintText: r == AdminResource.users
                        ? l.adminUserSearch
                        : l.searchHint,
                    prefixIcon: const Icon(Icons.search),
                  ),
                  onChanged: (text) {
                    _debounce?.cancel();
                    _debounce = Timer(const Duration(milliseconds: 300), () {
                      if (mounted) setState(() => _query = text.trim());
                    });
                  },
                ),
              if (r == AdminResource.users)
                _RoleFilter(
                  value: _role,
                  onChanged: (role) => setState(() => _role = role),
                ),
            ],
          ),
          if (r == AdminResource.warehouses || r == AdminResource.locations)
            const _SelectionSummary(),
          Expanded(
            child: AsyncValueView(
              value: value,
              loading: Padding(
                padding: AppLayout.pageInsets(context),
                child: SkeletonCardList(minItemWidth: AppLayout.cardMinWidth),
              ),
              onRetry: controller.refresh,
              builder: (context, list) => RefreshIndicator(
                onRefresh: controller.refresh,
                child: NotificationListener<ScrollMetricsNotification>(
                  onNotification: (n) {
                    if (n.depth == 0) nearEnd(n.metrics);
                    return false;
                  },
                  child: NotificationListener<ScrollNotification>(
                    onNotification: (n) {
                      if (n.depth == 0) nearEnd(n.metrics);
                      return false;
                    },
                    child: list.items.isEmpty
                        ? CustomScrollView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            slivers: [
                              SliverFillRemaining(
                                hasScrollBody: false,
                                child: AppEmptyView(
                                  title: l.adminEmpty,
                                  message: '',
                                ),
                              ),
                            ],
                          )
                        : ResponsiveCardList(
                            key: ValueKey(query),
                            physics: const AlwaysScrollableScrollPhysics(),
                            padding: EdgeInsetsDirectional.fromSTEB(
                              AppLayout.pageHorizontal(context),
                              AppSpacing.sm,
                              AppLayout.pageHorizontal(context),
                              AppSpacing.xxxl * 2,
                            ),
                            itemCount: list.items.length,
                            footer: list.appendError != null
                                ? AppErrorView(
                                    error: list.appendError,
                                    onRetry: controller.loadMore,
                                  )
                                : list.loadingMore
                                ? const SkeletonCardList(itemCount: 1)
                                : null,
                            itemBuilder: (context, index) {
                              final record = list.items[index];
                              final lang = Localizations.localeOf(
                                context,
                              ).languageCode;
                              return AppCard(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      r == AdminResource.locations
                                          ? ['zone', 'aisle', 'shelf', 'bin']
                                                .where(
                                                  (key) => record
                                                      .text(key)
                                                      .isNotEmpty,
                                                )
                                                .map(
                                                  (key) =>
                                                      '${adminFieldLabel(l, key)}: ${record.text(key)}',
                                                )
                                                .join(' · ')
                                          : record.label(lang),
                                      style: context.text.titleSmall,
                                    ),
                                    const SizedBox(height: AppSpacing.sm),
                                    if (r == AdminResource.products)
                                      Text(
                                        '${l.adminFieldPrice}: ${record.text('sale_price')} · ${adminStatusLabel(l, record.text('status'))}',
                                        style: context.text.bodySmall,
                                      ),
                                    if (r == AdminResource.users)
                                      Text(
                                        '${record.text('phone')} · ${record.text('role')}',
                                      ),
                                    if (r == AdminResource.suppliers)
                                      Text(
                                        [
                                              record.text('phone'),
                                              record.text('address'),
                                            ]
                                            .where((s) => s.isNotEmpty)
                                            .join(' · '),
                                      ),
                                    if (record.json.containsKey('is_active'))
                                      Text(
                                        record.flag('is_active')
                                            ? l.adminFieldActive
                                            : l.adminInactive,
                                        style: context.text.bodySmall,
                                      ),
                                    if (r == AdminResource.categories &&
                                        record.text('parent_id').isNotEmpty)
                                      Text(
                                        '${l.adminFieldParent}: ${list.items.where((v) => v.id == record.text('parent_id')).firstOrNull?.label(lang) ?? record.text('parent_id')}',
                                        style: context.text.bodySmall,
                                      ),
                                    if (r == AdminResource.roles)
                                      Text(
                                        '${l.adminPermissions}: ${(record.json['permissions'] as List? ?? []).length}',
                                        style: context.text.bodySmall,
                                      ),
                                    if (canWrite && r.canEdit)
                                      Wrap(
                                        spacing: AppSpacing.sm,
                                        children: [
                                          TextButton.icon(
                                            onPressed: () => _form(record),
                                            icon: const Icon(
                                              Icons.edit_outlined,
                                            ),
                                            label: Text(l.adminEdit),
                                          ),
                                          if (!(r == AdminResource.roles &&
                                              record.flag('is_system')))
                                            TextButton.icon(
                                              onPressed: () => _delete(record),
                                              icon: const Icon(
                                                Icons.delete_outline,
                                              ),
                                              label: Text(l.actionDelete),
                                            ),
                                        ],
                                      ),
                                    if (r == AdminResource.warehouses)
                                      AppButton(
                                        label: l.adminLocations,
                                        variant: AppButtonVariant.secondary,
                                        onPressed: !record.flag('is_active')
                                            ? null
                                            : () {
                                                ref
                                                    .read(
                                                      warehouseSelectionProvider
                                                          .notifier,
                                                    )
                                                    .selectWarehouse(record);
                                                context.push(
                                                  '/admin/manage/locations?warehouse=${record.id}',
                                                );
                                              },
                                      ),
                                    if (r == AdminResource.locations)
                                      AppButton(
                                        label:
                                            ref
                                                    .watch(
                                                      warehouseSelectionProvider,
                                                    )
                                                    .location
                                                    ?.id ==
                                                record.id
                                            ? l.adminSelected
                                            : l.adminSelect,
                                        onPressed:
                                            ref
                                                    .watch(
                                                      warehouseSelectionProvider,
                                                    )
                                                    .warehouse
                                                    ?.id !=
                                                record.text('warehouse_id')
                                            ? null
                                            : () => ref
                                                  .read(
                                                    warehouseSelectionProvider
                                                        .notifier,
                                                  )
                                                  .selectLocation(record),
                                      ),
                                  ],
                                ),
                              );
                            },
                          ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoleFilter extends ConsumerWidget {
  const _RoleFilter({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = const AdminQuery(AdminResource.roles);
    return AsyncValueView(
      value: ref.watch(adminLookupsProvider(query)),
      loading: const Skeleton.line(),
      onRetry: () => ref.invalidate(adminLookupsProvider(query)),
      builder: (context, roles) => DropdownButtonFormField<String>(
        key: ValueKey(value),
        initialValue: roles.any((r) => r.text('name') == value) ? value : null,
        isExpanded: true,
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.badge_outlined),
          hintText: context.l10n.adminFieldRole,
        ),
        items: [
          DropdownMenuItem<String>(
            value: null,
            child: Text(context.l10n.adminAllRoles),
          ),
          for (final role in roles)
            DropdownMenuItem(
              value: role.text('name'),
              child: Text(role.text('name')),
            ),
        ],
        onChanged: onChanged,
      ),
    );
  }
}

class _SelectionSummary extends ConsumerWidget {
  const _SelectionSummary();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(warehouseSelectionProvider), l = context.l10n;
    if (selected.warehouse == null) return const SizedBox.shrink();
    return Padding(
      padding: AppLayout.pageInsets(context),
      child: Text(
        '${l.adminSelectedWarehouse}: ${selected.warehouse!.label(Localizations.localeOf(context).languageCode)}\n${l.adminSelectedLocation}: ${selected.location == null ? l.adminNoLocation : ['zone', 'aisle', 'shelf', 'bin'].map((k) => selected.location!.text(k)).join(' / ')}',
        style: context.text.bodySmall,
      ),
    );
  }
}
