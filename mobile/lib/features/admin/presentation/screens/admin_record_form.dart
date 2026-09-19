import '../../../../core/config/app_config.dart';
import '../../../catalog/data/category_description_limits.dart';
import '../../../catalog/data/media/catalog_image.dart';
import '../../../catalog/presentation/widgets/category_icon_catalog.dart';
import '../../../catalog/presentation/widgets/catalog_image_view.dart';
import '../widgets/category_icon_picker.dart';
import '../widgets/store_images_editor.dart';
import '../../../../core/utils/numeric_input_formatters.dart';
import '../../../../core/utils/numeric_text.dart';
import '../widgets/admin_app_bar.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../auth/domain/user_role.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../domain/admin_repository.dart';
import '../../domain/admin_category_tree.dart';
import '../providers/admin_providers.dart';
import '../widgets/admin_labels.dart';
import '../widgets/admin_variants_editor.dart';

class AdminRecordForm extends ConsumerStatefulWidget {
  const AdminRecordForm({
    super.key,
    required this.query,
    this.record,
    this.categoryParent,
  });
  final AdminQuery query;
  final AdminRecord? record;
  final AdminRecord? categoryParent;
  @override
  ConsumerState<AdminRecordForm> createState() => _AdminRecordFormState();
}

class _AdminRecordFormState extends ConsumerState<AdminRecordForm> {
  static const _moneyFields = {'sale_price', 'compare_at_price', 'floor_price'};
  final _form = GlobalKey<FormState>();
  final _controllers = <String, TextEditingController>{};
  late Map<String, dynamic> _draft;
  bool _busy = false;
  bool _picking = false;
  bool get _isMock => ref.read(dataSourceProvider) == DataSource.mock;
  Set<String> get _fields => {
    for (final field in resource.fields)
      if (!(resource == AdminResource.categories &&
              (widget.record == null ||
                  widget.record!.text('parent_id').isEmpty) &&
              field == 'parent_id') &&
          !(_isMock && resource == AdminResource.categories && field == 'icon'))
        field,
    if (_isMock && resource == AdminResource.categories) ...{
      'mock_icon_key',
      'mock_description_en',
      'mock_description_ar',
      'mock_image',
    },
  };
  AdminResource get resource => widget.query.resource;
  @override
  void initState() {
    super.initState();
    _draft = {...?widget.record?.json};
    if (widget.record == null && resource == AdminResource.categories) {
      _draft['parent_id'] = widget.categoryParent?.id;
    }
    if (widget.record == null && resource == AdminResource.products) {
      _draft['category_id'] = widget.query.categoryId;
    }
    for (final field in _fields) {
      final value = _draft[field];
      _controllers[field] = TextEditingController(
        text: field == 'password'
            ? ''
            : _moneyFields.contains(field)
            ? MoneyText.fromNumber(value as num?)
            : value?.toString() ?? '',
      );
    }
    if (_isMock && resource == AdminResource.categories) {
      _draft['mock_icon_key'] ??= 'general_category';
      if (widget.record == null) _draft['mock_image_managed'] = true;
    }
    if (_isMock && resource == AdminResource.products) {
      _draft['mock_images'] = List<CatalogImage>.from(
        (_draft['mock_images'] as List?) ??
            [
              for (final url in _draft['images'] as List? ?? [])
                UrlCatalogImage(url as String),
            ],
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
    if (_busy || _picking || !_form.currentState!.validate()) return;
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
      'images',
      'mock_image',
      'mock_icon_key',
    };
    for (final field in _fields) {
      if (special.contains(field)) continue;
      final entered = _controllers[field]!.text.trim();
      final text = _moneyFields.contains(field)
          ? MoneyText.normalize(entered)
          : numeric.contains(field) || field == 'phone'
          ? normalizeDigits(entered)
          : entered;
      if (field == 'password' && text.isEmpty) {
        input.remove(field);
        continue;
      }
      input[field] = numeric.contains(field)
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
      appBar: adminAppBar(
        context,
        ref,
        title: widget.record == null && resource == AdminResource.categories
            ? (widget.categoryParent == null
                  ? l.adminAddMainCategory
                  : l.adminAddSubcategory)
            : '${widget.record == null ? l.adminAdd : l.adminEdit} · ${adminTitle(l, resource)}',
      ),
      body: SafeArea(
        top: false,
        left: false,
        right: false,
        bottom: resource == AdminResource.products,
        child: optionsResource == null
            ? _body(const [])
            : AsyncValueView(
                value: ref.watch(
                  adminLookupsProvider(AdminQuery(optionsResource)),
                ),
                loading: ResponsiveContent(
                  maxWidth: AppLayout.formWidth,
                  child: Padding(
                    padding: AppLayout.pageInsets(context),
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
          padding: AppLayout.pageInsets(context),
          child: ResponsiveFields(
            children: [
              if (widget.record == null && widget.categoryParent != null)
                ResponsiveField(
                  fullWidth: true,
                  child: Text(
                    '${l.adminFieldParent}: ${widget.categoryParent!.label(Localizations.localeOf(context).languageCode)}',
                    key: const ValueKey('category-create-parent'),
                    style: context.text.titleSmall,
                  ),
                ),
              for (final field in _fields)
                if (!field.startsWith('mock_description_') ||
                    _draft['parent_id'] == null)
                  ResponsiveField(
                    key: ValueKey('layout-$field'),
                    fullWidth: const [
                      'mock_image',
                      'mock_icon_key',
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
                      onPressed: _picking ? null : _save,
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
    if (field == 'mock_icon_key') {
      final selected = _draft[field] as String?;
      return OutlinedButton.icon(
        key: const ValueKey('category-icon-picker'),
        icon: Icon(CategoryIconCatalog.resolve(selected)),
        label: Text(
          '${l.categoryChooseIcon} · ${CategoryIconCatalog.label(selected ?? '', l)}',
        ),
        onPressed: _busy
            ? null
            : () async {
                final key = await showDialog<String>(
                  context: context,
                  builder: (_) => CategoryIconPicker(selected: selected),
                );
                if (mounted && key != null) setState(() => _draft[field] = key);
              },
      );
    }
    if (field.startsWith('mock_description_')) {
      return TextFormField(
        key: ValueKey(field),
        controller: _controllers[field],
        readOnly: _busy,
        maxLines: 2,
        decoration: InputDecoration(
          labelText: field.endsWith('_en')
              ? l.categoryDescriptionEn
              : l.categoryDescriptionAr,
          helperText: l.categoryDescriptionLimit(
            '${CategoryDescriptionLimits.maxWords}',
            '${CategoryDescriptionLimits.maxCharacters}',
          ),
          helperMaxLines: 2,
        ),
        validator: (value) => _draft['parent_id'] != null
            ? null
            : (value == null || value.trim().isEmpty)
            ? l.adminRequired
            : !CategoryDescriptionLimits.isValid(value)
            ? l.categoryDescriptionInvalid
            : null,
      );
    }
    if (field == 'mock_image' || field == 'images') {
      final multiple = field == 'images';
      final images = multiple
          ? (_isMock
                ? (_draft['mock_images'] as List).cast<CatalogImage>()
                : [
                    for (final url in _draft['images'] as List? ?? [])
                      UrlCatalogImage(url as String),
                  ])
          : [if (_draft['mock_image'] case final CatalogImage image) image];
      if (!_isMock) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.mediaImages, style: context.text.titleSmall),
            Text(l.mediaRemoteHint),
            ResponsiveFields(
              children: [
                for (final image in images)
                  AspectRatio(
                    aspectRatio: 1,
                    child: CatalogImageView(image: image),
                  ),
              ],
            ),
          ],
        );
      }
      return StoreImagesEditor(
        images: images,
        multiple: multiple,
        guidance: multiple
            ? l.mediaProductGuidance
            : _draft['parent_id'] == null
            ? l.mediaMainCategoryGuidance
            : l.mediaSubcategoryGuidance,
        enabled: !_busy,
        onBusyChanged: (value) => setState(() => _picking = value),
        onChanged: (images) => setState(() {
          if (multiple) {
            _draft['mock_images'] = images;
          } else {
            _draft['mock_image'] = images.firstOrNull;
            _draft['mock_image_managed'] = true;
          }
        }),
      );
    }
    if (const ['is_active', 'is_negotiable', 'tracks_expiry'].contains(field)) {
      return SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(
          field == 'is_active' && resource == AdminResource.categories
              ? l.categoryVisible
              : adminFieldLabel(l, field),
        ),
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
        final categoryTree = AdminCategoryTree(options);
        for (final option in options) {
          if (field == 'category_id' && option.text('parent_id').isEmpty) {
            continue;
          }
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
          choices[field == 'role'
              ? option.text('name')
              : option.id] = field == 'category_id' || field == 'parent_id'
              ? categoryTree.label(
                  option.id,
                  Localizations.localeOf(context).languageCode,
                )
              : option.label(Localizations.localeOf(context).languageCode);
        }
      }
      final selected = _draft[field] as String?;
      // Retain a legacy root/missing category on edit without offering it as a
      // new assignment. A main-category list scope cannot seed a new product.
      final retainedProductCategory =
          field == 'category_id' &&
          selected != null &&
          selected == widget.record?.text('category_id') &&
          !choices.containsKey(selected);
      if (selected != null &&
          !choices.containsKey(selected) &&
          selected != widget.record?.id &&
          (field != 'category_id' || retainedProductCategory)) {
        final path = field == 'category_id'
            ? AdminCategoryTree(
                options,
              ).label(selected, Localizations.localeOf(context).languageCode)
            : '';
        choices[selected] = path.isEmpty ? selected : path;
      }
      return DropdownButtonFormField<String>(
        key: ValueKey('$field-$selected'),
        initialValue: choices.containsKey(selected) ? selected : null,
        isExpanded: true,
        decoration: InputDecoration(
          labelText: adminFieldLabel(l, field),
          helperText: retainedProductCategory
              ? l.adminRetainedProductCategory
              : null,
          helperMaxLines: 5,
        ),
        items: [
          if (field == 'parent_id')
            DropdownMenuItem<String>(value: null, child: Text(l.adminNoParent)),
          for (final entry in choices.entries)
            DropdownMenuItem(
              value: entry.key,
              enabled: !(retainedProductCategory && entry.key == selected),
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
      maxLines: field == 'description' ? 3 : 1,
      inputFormatters: _moneyFields.contains(field)
          ? const [MoneyInputFormatter()]
          : field == 'phone'
          ? const [PhoneInputFormatter()]
          : isNumeric
          ? const [WesternDigitsInputFormatter()]
          : null,
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
        final entered = value?.trim() ?? '';
        final text = _moneyFields.contains(field)
            ? MoneyText.normalize(entered)
            : isNumeric
            ? normalizeDigits(entered)
            : entered;
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
        return null;
      },
    );
  }
}
