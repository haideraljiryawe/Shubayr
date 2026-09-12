import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../domain/admin_repository.dart';
import '../providers/admin_providers.dart';
import '../widgets/admin_labels.dart';
import '../widgets/admin_variants_editor.dart';

class AdminRecordForm extends ConsumerStatefulWidget {
  const AdminRecordForm({super.key, required this.query, this.record});
  final AdminQuery query;
  final AdminRecord? record;
  @override
  ConsumerState<AdminRecordForm> createState() => _AdminRecordFormState();
}

class _AdminRecordFormState extends ConsumerState<AdminRecordForm> {
  final _form = GlobalKey<FormState>();
  final _controllers = <String, TextEditingController>{};
  late Map<String, dynamic> _draft;
  bool _busy = false;
  AdminResource get resource => widget.query.resource;
  @override
  void initState() {
    super.initState();
    _draft = {...?widget.record?.json};
    for (final field in resource.fields) {
      final value = _draft[field];
      _controllers[field] = TextEditingController(
        text: field == 'password'
            ? ''
            : field == 'images'
            ? ((value as List?) ?? []).join('\n')
            : value?.toString() ?? '',
      );
    }
    _draft['is_active'] ??= true;
    _draft['status'] ??= 'active';
    _draft['is_negotiable'] ??= false;
    _draft['tracks_expiry'] ??= false;
    _draft['role'] ??= 'customer';
    _draft['permissions'] = List<String>.from(
      _draft['permissions'] as List? ?? [],
    );
    _draft['variants'] = [
      for (final v in _draft['variants'] as List? ?? [])
        Map<String, dynamic>.from(v as Map),
    ];
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    final input = {..._draft};
    const numeric = {
      'sale_price',
      'compare_at_price',
      'floor_price',
      'points_price',
      'sort_order',
    };
    const special = {
      'category_id',
      'parent_id',
      'role',
      'status',
      'is_active',
      'is_negotiable',
      'tracks_expiry',
      'permissions',
      'variants',
    };
    for (final field in resource.fields) {
      if (special.contains(field)) continue;
      final text = _controllers[field]!.text.trim();
      if (field == 'password' && text.isEmpty) {
        input.remove(field);
        continue;
      }
      input[field] = field == 'images'
          ? text
                .split('\n')
                .map((s) => s.trim())
                .where((s) => s.isNotEmpty)
                .toList()
          : numeric.contains(field)
          ? text.isEmpty
                ? (field == 'sort_order' ? 0 : null)
                : ['points_price', 'sort_order'].contains(field)
                ? num.parse(text).toInt()
                : num.parse(text)
          : (field == 'email' && text.isEmpty)
          ? null
          : text;
    }
    setState(() => _busy = true);
    try {
      final saved = await ref
          .read(adminListProvider(widget.query).notifier)
          .save(input, id: widget.record?.id);
      if (saved && mounted) {
        showAppSnackBarMessage(context, message: context.l10n.adminSaved);
        Navigator.pop(context);
      }
    } catch (error) {
      if (mounted) {
        showAppSnackBarMessage(
          context,
          message: (error is AppFailure ? error : const AppFailure.unknown())
              .localizedMessage(context.l10n),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final session = ref.watch(sessionControllerProvider).value;
    if (session?.role != UserRole.staff ||
        session?.can(resource.writePermission) != true) {
      return Scaffold(
        appBar: AppBar(),
        body: AppEmptyView(message: l.adminNoAccess),
      );
    }
    // Keep the mutation controller alive while this route is open.
    ref.watch(adminListProvider(widget.query));
    final optionsResource = switch (resource) {
      AdminResource.products ||
      AdminResource.categories => AdminResource.categories,
      AdminResource.users => AdminResource.roles,
      AdminResource.roles => AdminResource.permissions,
      _ => null,
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(
          '${widget.record == null ? l.adminAdd : l.adminEdit} · ${adminTitle(l, resource)}',
        ),
      ),
      body: optionsResource == null
          ? _body(const [])
          : AsyncValueView(
              value: ref.watch(
                adminLookupsProvider(AdminQuery(optionsResource)),
              ),
              loading: const ResponsiveContent(
                maxWidth: AppLayout.formWidth,
                child: Padding(
                  padding: EdgeInsets.all(AppSpacing.screenH),
                  child: SkeletonCardList(
                    minItemWidth: AppLayout.fieldMinWidth,
                  ),
                ),
              ),
              onRetry: () => ref.invalidate(
                adminLookupsProvider(AdminQuery(optionsResource)),
              ),
              builder: (_, options) => _body(options),
            ),
    );
  }

  Widget _body(List<AdminRecord> options) {
    final l = context.l10n;
    return ResponsiveContent(
      maxWidth: AppLayout.formWidth,
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.screenH),
          child: ResponsiveFields(
            children: [
              for (final field in resource.fields)
                ResponsiveField(
                  key: ValueKey('layout-$field'),
                  fullWidth: const [
                    'description',
                    'images',
                    'variants',
                    'permissions',
                  ].contains(field),
                  child: _field(field, options),
                ),
              ResponsiveField(
                fullWidth: true,
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: ResponsiveContent(
                    maxWidth: AppLayout.authWidth,
                    child: AppButton(
                      label: l.actionSave,
                      isLoading: _busy,
                      onPressed: _save,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(String field, List<AdminRecord> options) {
    final l = context.l10n;
    if (const ['is_active', 'is_negotiable', 'tracks_expiry'].contains(field)) {
      return SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(adminFieldLabel(l, field)),
        value: _draft[field] == true,
        onChanged: _busy ? null : (v) => setState(() => _draft[field] = v),
      );
    }
    if (field == 'variants') {
      return AdminVariantsEditor(
        value: List<Map<String, dynamic>>.from(_draft['variants'] as List),
        onChanged: (v) => _draft['variants'] = v,
      );
    }
    if (field == 'permissions') {
      final selected = (_draft[field] as List).cast<String>();
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.adminPermissions, style: context.text.titleSmall),
          Text(l.adminPermissionHint, style: context.text.bodySmall),
          ResponsiveFields(
            minItemWidth: AppLayout.cardMinWidth,
            children: [
              for (final option in options)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(adminPermissionLabel(l, option.text('key'))),
                  subtitle: option.text('description').isEmpty
                      ? null
                      : Text(option.text('description')),
                  value: selected.contains(option.id),
                  onChanged: _busy
                      ? null
                      : (checked) => setState(() {
                          _draft[field] = checked == true
                              ? {...selected, option.id}.toList()
                              : selected
                                    .where((key) => key != option.id)
                                    .toList();
                        }),
                ),
            ],
          ),
        ],
      );
    }
    if (const ['category_id', 'parent_id', 'role', 'status'].contains(field)) {
      final choices = <String, String>{};
      if (field == 'status') {
        for (final status in ['active', 'hidden', 'archived']) {
          choices[status] = adminStatusLabel(l, status);
        }
      } else {
        for (final option in options) {
          if (field == 'parent_id') {
            var candidate = option;
            final seen = <String>{};
            var invalid = false;
            while (seen.add(candidate.id)) {
              if (candidate.id == widget.record?.id) {
                invalid = true;
                break;
              }
              final parent = options
                  .where((p) => p.id == candidate.text('parent_id'))
                  .firstOrNull;
              if (parent == null) break;
              candidate = parent;
            }
            if (invalid) continue;
          }
          choices[field == 'role' ? option.text('name') : option.id] = option
              .label(Localizations.localeOf(context).languageCode);
        }
      }
      final selected = _draft[field] as String?;
      // Preserve an existing reference that the read endpoint does not return.
      if (selected != null &&
          !choices.containsKey(selected) &&
          selected != widget.record?.id) {
        choices[selected] = selected;
      }
      return DropdownButtonFormField<String>(
        key: ValueKey('$field-$selected'),
        initialValue: choices.containsKey(selected) ? selected : null,
        isExpanded: true,
        decoration: InputDecoration(labelText: adminFieldLabel(l, field)),
        items: [
          if (field == 'parent_id')
            DropdownMenuItem<String>(value: null, child: Text(l.adminNoParent)),
          for (final entry in choices.entries)
            DropdownMenuItem(
              value: entry.key,
              child: Text(entry.value, overflow: TextOverflow.ellipsis),
            ),
        ],
        validator: (v) => resource.requiredFields.contains(field) && v == null
            ? l.adminRequired
            : null,
        onChanged: _busy
            ? null
            : (value) => setState(() => _draft[field] = value),
      );
    }
    final isNumeric = const [
      'sale_price',
      'compare_at_price',
      'floor_price',
      'points_price',
      'sort_order',
    ].contains(field);
    return TextFormField(
      key: ValueKey(field),
      controller: _controllers[field],
      readOnly:
          _busy ||
          (field == 'name' &&
              resource == AdminResource.roles &&
              widget.record?.flag('is_system') == true),
      obscureText: field == 'password',
      enableSuggestions: field != 'password',
      autocorrect: field != 'password',
      maxLines: field == 'description' || field == 'images' ? 3 : 1,
      keyboardType: isNumeric
          ? const TextInputType.numberWithOptions(decimal: true, signed: true)
          : field == 'phone'
          ? TextInputType.phone
          : field == 'email'
          ? TextInputType.emailAddress
          : null,
      decoration: InputDecoration(
        labelText: adminFieldLabel(l, field),
        helperText: field == 'compare_at_price'
            ? l.adminOriginalPriceHint
            : null,
        helperMaxLines: 3,
      ),
      validator: (value) {
        final text = value?.trim() ?? '';
        if (text.isEmpty) {
          return resource.requiredFields.contains(field)
              ? l.adminRequired
              : null;
        }
        if (isNumeric) {
          final number = num.tryParse(text);
          if (number == null ||
              !number.isFinite ||
              (field != 'sort_order' && number < 0) ||
              (['points_price', 'sort_order'].contains(field) &&
                  number != number.round())) {
            return l.adminInvalidNumber;
          }
        }
        if (field == 'email' &&
            !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(text)) {
          return l.adminInvalidEmail;
        }
        if (field == 'images' &&
            text.split('\n').where((s) => s.trim().isNotEmpty).any((line) {
              final uri = Uri.tryParse(line.trim());
              return uri == null ||
                  !['http', 'https'].contains(uri.scheme) ||
                  uri.host.isEmpty;
            })) {
          return l.adminInvalidUrl;
        }
        return null;
      },
    );
  }
}
