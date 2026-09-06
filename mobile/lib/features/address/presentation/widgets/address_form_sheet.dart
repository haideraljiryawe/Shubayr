import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../data/address.dart';
import '../providers/address_providers.dart';

/// Opens the add/edit address form as a bottom sheet. Pass [address] to edit.
Future<void> showAddressForm(BuildContext context, {Address? address}) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddressFormSheet(address: address),
    );

class _AddressFormSheet extends ConsumerStatefulWidget {
  const _AddressFormSheet({this.address});

  final Address? address;

  @override
  ConsumerState<_AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends ConsumerState<_AddressFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late final _label = TextEditingController(text: widget.address?.label ?? '');
  late final _city = TextEditingController(text: widget.address?.city ?? '');
  late final _area = TextEditingController(text: widget.address?.area ?? '');
  late final _street = TextEditingController(
    text: widget.address?.street ?? '',
  );
  late final _details = TextEditingController(
    text: widget.address?.details ?? '',
  );
  late bool _isDefault = widget.address?.isDefault ?? false;
  bool _busy = false;

  @override
  void dispose() {
    _label.dispose();
    _city.dispose();
    _area.dispose();
    _street.dispose();
    _details.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    setState(() => _busy = true);
    final details = _details.text.trim();
    final input = AddressInput(
      label: _label.text.trim(),
      city: _city.text.trim(),
      area: _area.text.trim(),
      street: _street.text.trim(),
      details: details.isEmpty ? null : details,
      isDefault: _isDefault,
    );
    final controller = ref.read(addressesControllerProvider.notifier);
    if (widget.address == null) {
      await controller.add(input);
    } else {
      await controller.edit(widget.address!.id, input);
    }
    if (!mounted) return;
    setState(() => _busy = false);

    if (ref.read(addressesControllerProvider).hasError) {
      messenger.showSnackBar(
        SnackBar(content: Text(context.l10n.stateErrorTitle)),
      );
      return;
    }
    navigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final media = MediaQuery.of(context);
    return ConstrainedBox(
      // Cap the sheet at two-thirds of the screen so focusing a field (which
      // opens the keyboard) can never blow it up to full height. The keyboard
      // inset is kept as the scroll view's bottom padding, so the fields scroll
      // within this fixed frame above the keyboard instead of the sheet
      // resizing — which was causing the jump between fields and blocking
      // swipe-to-dismiss.
      constraints: BoxConstraints(maxHeight: media.size.height * 0.66),
      child: Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.screenH,
          right: AppSpacing.screenH,
          top: AppSpacing.lg,
          bottom: media.viewInsets.bottom + AppSpacing.lg,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.address == null ? l10n.addressAdd : l10n.addressEdit,
                  style: context.text.titleMedium,
                ),
                const SizedBox(height: AppSpacing.lg),
                TextFormField(
                  controller: _label,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressLabel),
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _city,
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? l10n.addressCityRequired
                      : null,
                  decoration: InputDecoration(labelText: l10n.addressCity),
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _area,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressArea),
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _street,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressStreet),
                ),
                const SizedBox(height: AppSpacing.md),
                TextFormField(
                  controller: _details,
                  maxLines: 2,
                  decoration: InputDecoration(labelText: l10n.addressDetails),
                ),
                const SizedBox(height: AppSpacing.sm),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _isDefault,
                  onChanged: (v) => setState(() => _isDefault = v),
                  title: Text(l10n.addressSetDefault),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: l10n.actionSave,
                  isLoading: _busy,
                  onPressed: _save,
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
