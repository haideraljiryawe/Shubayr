import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../data/address.dart';
import '../providers/address_providers.dart';

/// Full-screen add/edit address form (reached with a back button, like the
/// profile editor). A full page — rather than a bottom sheet — so the fields
/// have room to scroll comfortably when the keyboard is up. Pass [address] to
/// edit an existing one.
class AddressFormScreen extends ConsumerStatefulWidget {
  const AddressFormScreen({super.key, this.address});

  final Address? address;

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _label = TextEditingController(text: widget.address?.label ?? '');
  late final _city = TextEditingController(text: widget.address?.city ?? '');
  late final _area = TextEditingController(text: widget.address?.area ?? '');
  late final _street = TextEditingController(text: widget.address?.street ?? '');
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
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.address == null ? l10n.addressAdd : l10n.addressEdit,
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenH),
          children: [
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
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: l10n.actionSave,
              icon: Icons.check,
              isLoading: _busy,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
