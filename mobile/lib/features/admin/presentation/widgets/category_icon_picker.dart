import 'package:flutter/material.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../catalog/presentation/widgets/category_icon_catalog.dart';

class CategoryIconPicker extends StatefulWidget {
  const CategoryIconPicker({super.key, this.selected});
  final String? selected;
  @override
  State<CategoryIconPicker> createState() => _CategoryIconPickerState();
}

class _CategoryIconPickerState extends State<CategoryIconPicker> {
  String _query = '';
  String? _group;
  late String? _selected = widget.selected;
  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final entries = CategoryIconCatalog.search(_query, group: _group);
    return Dialog(
      child: ConstrainedBox(
        constraints: const BoxConstraints(
          maxWidth: AppLayout.readingWidth,
          maxHeight: AppLayout.dateRangeHeight,
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      l.categoryChooseIcon,
                      style: context.text.titleMedium,
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                    tooltip: MaterialLocalizations.of(
                      context,
                    ).closeButtonTooltip,
                  ),
                ],
              ),
              TextField(
                key: const ValueKey('icon-search'),
                decoration: InputDecoration(
                  labelText: l.categorySearchIcons,
                  prefixIcon: const Icon(Icons.search),
                ),
                onChanged: (value) => setState(() => _query = value),
              ),
              const SizedBox(height: AppSpacing.sm),
              DropdownButtonFormField<String>(
                key: const ValueKey('icon-group'),
                initialValue: _group,
                isExpanded: true,
                items: [
                  DropdownMenuItem(value: '', child: Text(l.categoryAllGroups)),
                  for (final group
                      in CategoryIconCatalog.entries
                          .map((e) => e.group)
                          .toSet())
                    DropdownMenuItem(
                      value: group,
                      child: Text(CategoryIconCatalog.groupLabel(group, l)),
                    ),
                ],
                onChanged: (value) =>
                    setState(() => _group = value == '' ? null : value),
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  Icon(
                    CategoryIconCatalog.resolve(_selected),
                    size: AppLayout.categoryIconSize,
                    color: context.colors.primary,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(CategoryIconCatalog.label(_selected ?? '', l)),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Flexible(
                child: entries.isEmpty
                    ? Center(child: Text(l.categoryNoIcons))
                    : LayoutBuilder(
                        builder: (context, constraints) => GridView.builder(
                          key: const ValueKey('icon-grid'),
                          gridDelegate:
                              SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount:
                                    (constraints.maxWidth /
                                            (AppLayout.categoryShortcutWidth *
                                                AppLayout.textScale(context)))
                                        .floor()
                                        .clamp(1, 8),
                                mainAxisExtent:
                                    AppLayout.categoryShortcutWidth *
                                    AppLayout.textScale(context),
                                mainAxisSpacing: AppSpacing.xs,
                                crossAxisSpacing: AppSpacing.xs,
                              ),
                          itemCount: entries.length,
                          itemBuilder: (context, i) {
                            final entry = entries[i];
                            final selected = entry.key == _selected;
                            return Semantics(
                              selected: selected,
                              button: true,
                              label: entry.label(l),
                              child: Material(
                                color: selected
                                    ? context.colors.primarySoft
                                    : context.colors.surface,
                                child: InkWell(
                                  key: ValueKey('icon-${entry.key}'),
                                  onTap: () =>
                                      setState(() => _selected = entry.key),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        entry.icon,
                                        color: context.colors.textPrimary,
                                      ),
                                      Text(
                                        entry.label(l),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        textAlign: TextAlign.center,
                                        style: context.text.labelSmall,
                                      ),
                                      if (selected)
                                        Icon(
                                          Icons.check,
                                          size: AppSpacing.lg,
                                          color: context.colors.textPrimary,
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: FilledButton(
                  onPressed: _selected == null
                      ? null
                      : () => Navigator.pop(context, _selected),
                  child: Text(l.actionSave),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
