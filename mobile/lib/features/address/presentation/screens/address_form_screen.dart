import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/config/app_config.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/validators.dart';
import '../../../auth/presentation/providers/auth_providers.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_snackbar.dart';
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
  late final _street = TextEditingController(
    text: widget.address?.street ?? '',
  );
  late final _details = TextEditingController(
    text: widget.address?.details ?? '',
  );
  late bool _isDefault = widget.address?.isDefault ?? false;
  bool _busy = false;
  bool _usePrimaryPhone = true;
  final _otherPhone = TextEditingController();

  String get _accountPhone => Validators.normalizePhone(
    ref.read(sessionControllerProvider).value?.user?.phone ?? '',
  );

  @override
  void initState() {
    super.initState();
    final saved = widget.address?.contactPhone;
    if (widget.address != null) {
      _usePrimaryPhone =
          saved != null && Validators.normalizePhone(saved) == _accountPhone;
      if (!_usePrimaryPhone) _otherPhone.text = saved ?? '';
    }
  }

  @override
  void dispose() {
    _label.dispose();
    _city.dispose();
    _area.dispose();
    _street.dispose();
    _details.dispose();
    _otherPhone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || ref.read(dataSourceProvider) != DataSource.mock) return;
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final navigator = Navigator.of(context);

    setState(() => _busy = true);
    final details = _details.text.trim();
    final input = AddressInput(
      label: _label.text.trim(),
      city: _city.text.trim(),
      area: _area.text.trim(),
      street: _street.text.trim(),
      details: details.isEmpty ? null : details,
      contactPhone: _usePrimaryPhone
          ? _accountPhone
          : Validators.normalizePhone(_otherPhone.text),
      lat: widget.address?.lat,
      lng: widget.address?.lng,
      isDefault: _isDefault,
    );
    final controller = ref.read(addressesControllerProvider.notifier);
    try {
      if (widget.address == null) {
        await controller.add(input);
      } else {
        await controller.edit(widget.address!.id, input);
      }
      if (mounted) navigator.pop();
    } catch (error) {
      if (!mounted) return;
      final failure = error is AppFailure ? error : const AppFailure.unknown();
      showAppSnackBarMessage(
        context,
        message: failure.localizedMessage(context.l10n),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    ref.watch(sessionControllerProvider);
    final supportsContact = ref.watch(dataSourceProvider) == DataSource.mock;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.address == null ? l10n.addressAdd : l10n.addressEdit,
        ),
      ),
      body: ResponsiveContent(
        maxWidth: AppLayout.formWidth,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: AppLayout.pageInsets(context),
            child: ResponsiveFields(
              children: [
                TextFormField(
                  controller: _label,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressLabel),
                ),
                TextFormField(
                  controller: _city,
                  textInputAction: TextInputAction.next,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? l10n.addressCityRequired
                      : null,
                  decoration: InputDecoration(labelText: l10n.addressCity),
                ),
                TextFormField(
                  controller: _area,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressArea),
                ),
                TextFormField(
                  controller: _street,
                  textInputAction: TextInputAction.next,
                  decoration: InputDecoration(labelText: l10n.addressStreet),
                ),
                ResponsiveField(
                  fullWidth: true,
                  child: TextFormField(
                    controller: _details,
                    maxLines: 2,
                    decoration: InputDecoration(labelText: l10n.addressDetails),
                  ),
                ),
                ResponsiveField(
                  fullWidth: true,
                  child: FormField<String>(
                    validator: (_) =>
                        Validators.isPhone(
                          _usePrimaryPhone ? _accountPhone : _otherPhone.text,
                        )
                        ? null
                        : l10n.authPhoneInvalid,
                    builder: (field) => Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          l10n.addressContactPhone,
                          style: context.text.titleSmall,
                        ),
                        RadioGroup<bool>(
                          groupValue: _usePrimaryPhone,
                          onChanged: (value) {
                            setState(() => _usePrimaryPhone = value!);
                            field.didChange(null);
                          },
                          child: Column(
                            children: [
                              RadioListTile<bool>(
                                key: const ValueKey('address-use-primary'),
                                value: true,
                                enabled: !_busy && supportsContact,
                                contentPadding: EdgeInsets.zero,
                                title: Text(l10n.addressUsePrimaryPhone),
                                subtitle: Text(
                                  _accountPhone.isEmpty
                                      ? l10n.accountNoPhone
                                      : _accountPhone,
                                  textDirection: TextDirection.ltr,
                                ),
                              ),
                              RadioListTile<bool>(
                                key: const ValueKey('address-use-other'),
                                value: false,
                                enabled: !_busy && supportsContact,
                                contentPadding: EdgeInsets.zero,
                                title: Text(l10n.addressUseOtherPhone),
                              ),
                            ],
                          ),
                        ),
                        if (!_usePrimaryPhone)
                          TextFormField(
                            key: const ValueKey('address-other-phone'),
                            controller: _otherPhone,
                            enabled: !_busy && supportsContact,
                            keyboardType: TextInputType.phone,
                            textDirection: TextDirection.ltr,
                            autofillHints: const [
                              AutofillHints.telephoneNumber,
                            ],
                            decoration: InputDecoration(
                              labelText: l10n.addressOtherPhone,
                            ),
                            onChanged: (_) => field.didChange(null),
                          ),
                        if (field.hasError)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.xs),
                            child: Text(
                              field.errorText!,
                              style: context.text.bodySmall?.copyWith(
                                color: context.colors.danger,
                              ),
                            ),
                          ),
                        if (!supportsContact)
                          Text(l10n.addressContactBackendPending),
                      ],
                    ),
                  ),
                ),
                ResponsiveField(
                  fullWidth: true,
                  child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _isDefault,
                    onChanged: (v) => setState(() => _isDefault = v),
                    title: Text(l10n.addressSetDefault),
                  ),
                ),
                ResponsiveField(
                  fullWidth: true,
                  child: ResponsiveContent(
                    maxWidth: AppLayout.authWidth,
                    child: AppButton(
                      label: l10n.actionSave,
                      icon: Icons.check,
                      isLoading: _busy,
                      onPressed: supportsContact ? _save : null,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
