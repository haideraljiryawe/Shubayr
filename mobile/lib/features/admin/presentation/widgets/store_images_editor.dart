import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../catalog/presentation/widgets/catalog_image_view.dart';
import '../../../catalog/data/media/catalog_image.dart';
import '../media/store_image_picker.dart';

class StoreImagesEditor extends ConsumerStatefulWidget {
  const StoreImagesEditor({
    super.key,
    required this.images,
    required this.onChanged,
    this.multiple = false,
    this.enabled = true,
    this.onBusyChanged,
    this.guidance,
    this.sessionOnly = true,
  });
  final List<CatalogImage> images;
  final ValueChanged<List<CatalogImage>> onChanged;
  final bool multiple, enabled, sessionOnly;
  final ValueChanged<bool>? onBusyChanged;
  final String? guidance;
  @override
  ConsumerState<StoreImagesEditor> createState() => _StoreImagesEditorState();
}

class _StoreImagesEditorState extends ConsumerState<StoreImagesEditor> {
  bool _picking = false;
  bool _confirming = false;
  Future<void> _pick([int? replace]) async {
    if (_picking || !widget.enabled) return;
    setState(() => _picking = true);
    widget.onBusyChanged?.call(true);
    try {
      final result = await ref
          .read(storeImagePickerProvider)
          .pick(multiple: widget.multiple && replace == null);
      if (!mounted || result.isEmpty) return;
      final images = [...widget.images];
      if (replace != null) {
        final picked = result.first;
        images[replace] = images[replace].productImageId == null
            ? picked
            : LocalCatalogImage(
                picked.bytes,
                name: picked.name,
                productImageId: images[replace].productImageId,
              );
      } else if (widget.multiple) {
        images.addAll(result);
      } else {
        images
          ..clear()
          ..add(result.first);
      }
      widget.onChanged(List.unmodifiable(images));
    } catch (_) {
      if (mounted) {
        showAppSnackBarMessage(context, message: context.l10n.mediaPickError);
      }
    } finally {
      if (mounted) {
        setState(() => _picking = false);
        widget.onBusyChanged?.call(false);
      }
    }
  }

  Future<void> _remove(int index) async {
    if (_picking || _confirming || !widget.enabled) return;
    final image = widget.images[index];
    final l = context.l10n;
    setState(() => _confirming = true);
    widget.onBusyChanged?.call(true);
    try {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l.mediaRemoveConfirm),
          content: Text(
            widget.multiple && index == 0
                ? l.mediaRemovePrimaryMessage
                : l.mediaRemoveMessage,
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(l.actionCancel),
            ),
            TextButton(
              key: const ValueKey('confirm-remove-image'),
              onPressed: () => Navigator.pop(context, true),
              child: Text(l.mediaRemove),
            ),
          ],
        ),
      );
      if (confirmed == true &&
          mounted &&
          widget.enabled &&
          index < widget.images.length &&
          identical(widget.images[index], image)) {
        widget.onChanged(
          List.unmodifiable([
            for (var i = 0; i < widget.images.length; i++)
              if (i != index) widget.images[i],
          ]),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _confirming = false);
        widget.onBusyChanged?.call(false);
      }
    }
  }

  void _move(int from, int to) {
    final images = [...widget.images];
    images.insert(to, images.removeAt(from));
    widget.onChanged(List.unmodifiable(images));
  }

  String guidanceText(BuildContext context) =>
      widget.guidance ??
      (widget.multiple
          ? context.l10n.mediaProductGuidance
          : context.l10n.mediaMainCategoryGuidance);

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    final enabled = widget.enabled && !_picking && !_confirming;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.multiple ? l.mediaImages : l.categoryImage,
          style: context.text.titleSmall,
        ),
        Text(guidanceText(context), style: context.text.bodySmall),
        if (widget.multiple)
          Text(l.mediaPrimaryHint, style: context.text.bodySmall),
        const SizedBox(height: AppSpacing.sm),
        if (widget.images.isEmpty) Text(l.mediaEmpty),
        ResponsiveFields(
          minItemWidth: AppLayout.cardMinWidth,
          children: [
            for (final (i, image) in widget.images.indexed)
              Column(
                key: ValueKey('media-item-$i'),
                children: [
                  AspectRatio(
                    aspectRatio: 1,
                    child: CatalogImageView(image: image),
                  ),
                  Wrap(
                    spacing: AppSpacing.xs,
                    children: [
                      TextButton(
                        key: ValueKey('media-replace-$i'),
                        onPressed: enabled ? () => _pick(i) : null,
                        child: Text(l.mediaReplace),
                      ),
                      TextButton(
                        key: ValueKey('media-remove-$i'),
                        onPressed: enabled ? () => _remove(i) : null,
                        child: Text(l.mediaRemove),
                      ),
                      if (widget.multiple) ...[
                        if (i == 0)
                          Chip(
                            key: const ValueKey('media-primary'),
                            avatar: const Icon(Icons.star),
                            label: Text(l.mediaPrimary),
                          )
                        else
                          TextButton.icon(
                            key: ValueKey('media-primary-$i'),
                            onPressed: enabled ? () => _move(i, 0) : null,
                            icon: const Icon(Icons.star_outline),
                            label: Text(l.mediaMakePrimary),
                          ),
                        IconButton(
                          key: ValueKey('media-earlier-$i'),
                          tooltip: l.mediaEarlier,
                          onPressed: enabled && i > 0
                              ? () => _move(i, i - 1)
                              : null,
                          icon: const Icon(Icons.arrow_upward),
                        ),
                        IconButton(
                          key: ValueKey('media-later-$i'),
                          tooltip: l.mediaLater,
                          onPressed: enabled && i + 1 < widget.images.length
                              ? () => _move(i, i + 1)
                              : null,
                          icon: const Icon(Icons.arrow_downward),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
          ],
        ),
        if (widget.multiple || widget.images.isEmpty)
          OutlinedButton.icon(
            key: const ValueKey('media-add'),
            onPressed: enabled ? () => _pick() : null,
            icon: const Icon(Icons.photo_library),
            label: Text(widget.multiple ? l.mediaAdd : l.mediaChoose),
          ),
        Text(
          widget.sessionOnly ? l.mediaSessionHint : l.mediaUploadHint,
          style: context.text.bodySmall,
        ),
      ],
    );
  }
}
