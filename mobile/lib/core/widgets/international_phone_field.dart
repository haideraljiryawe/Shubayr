import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import 'package:phone_numbers_parser/phone_numbers_parser.dart';

import '../l10n/l10n_context.dart';
import '../theme/theme_context.dart';
import '../theme/tokens/app_spacing.dart';
import '../theme/tokens/app_control_sizes.dart';
import '../utils/international_phone.dart';
import '../utils/numeric_input_formatters.dart';
import 'app_text_selection_toolbar.dart';

/// A shared country selection and phone input for sign-in and delivery contact.
class InternationalPhoneField extends StatefulWidget {
  const InternationalPhoneField({
    super.key,
    this.controller,
    this.initialValue = '',
    required this.label,
    this.onSaved,
    this.onFieldSubmitted,
    this.enabled = true,
    this.readOnly = false,
    this.inputKey,
    this.initialCountry,
    this.onCountryChanged,
  });
  final TextEditingController? controller;
  final String initialValue, label;
  final ValueChanged<String>? onSaved;
  final ValueChanged<String>? onFieldSubmitted;
  final bool enabled, readOnly;
  final Key? inputKey;
  final IsoCode? initialCountry;
  final ValueChanged<IsoCode>? onCountryChanged;

  @override
  State<InternationalPhoneField> createState() =>
      _InternationalPhoneFieldState();
}

class _InternationalPhoneFieldState extends State<InternationalPhoneField> {
  late final _controller =
      widget.controller ?? TextEditingController(text: widget.initialValue);
  late IsoCode _country;

  @override
  void initState() {
    super.initState();
    _country =
        InternationalPhone.parse(_controller.text)?.isoCode ??
        widget.initialCountry ??
        InternationalPhone.defaultCountry(
          WidgetsBinding.instance.platformDispatcher.locales,
        );
    _acceptInternationalInput();
    widget.onCountryChanged?.call(_country);
  }

  // Explicit international input determines its country. Show only national
  // digits beside the integrated calling code; never prepend a code twice.
  void _acceptInternationalInput() {
    final value = _controller.text;
    if (!value.startsWith('+')) return;
    final parsed = InternationalPhone.parse(value);
    if (parsed == null || !parsed.isValid()) return;
    _country = parsed.isoCode;
    _controller.value = TextEditingValue(
      text: parsed.nsn,
      selection: TextSelection.collapsed(offset: parsed.nsn.length),
    );
  }

  @override
  void didUpdateWidget(InternationalPhoneField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.controller == null &&
        widget.initialValue != oldWidget.initialValue) {
      _controller.text = widget.initialValue;
      _country =
          InternationalPhone.parse(widget.initialValue)?.isoCode ?? _country;
      _acceptInternationalInput();
    }
  }

  @override
  void dispose() {
    if (widget.controller == null) _controller.dispose();
    super.dispose();
  }

  void _selectCountry() {
    showCountryPicker(
      context: context,
      showPhoneCode: true,
      useSafeArea: true,
      moveAlongWithKeyboard: true,
      countryFilter: IsoCode.values.map((code) => code.name).toList(),
      countryListTheme: CountryListThemeData(
        backgroundColor: context.colors.surface,
        textStyle: context.text.bodyMedium,
        inputDecoration: InputDecoration(
          labelText: context.l10n.phoneCountrySearch,
          prefixIcon: const Icon(Icons.search),
        ),
      ),
      onSelect: (country) {
        if (!mounted || !widget.enabled || widget.readOnly) return;
        final previous = InternationalPhone.parse(
          _controller.text,
          country: _country,
        );
        setState(() {
          _country = IsoCode.values.byName(country.countryCode);
          // Remove an explicit old dial code when the user intentionally changes
          // country, retaining the national digits for editing/validation.
          if (_controller.text.startsWith('+') && previous != null) {
            _controller.text = previous.nsn;
          }
        });
        widget.onCountryChanged?.call(_country);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final country = Country.tryParse(_country.name);
    final countryName =
        CountryLocalizations(
          Localizations.localeOf(context),
        ).countryName(countryCode: _country.name) ??
        country?.name ??
        _country.name;
    final dialCode = '+${PhoneNumber(isoCode: _country, nsn: '').countryCode}';
    final rtl = Directionality.of(context) == TextDirection.rtl;
    // Only the country/number runs are LTR. InputDecorator keeps the ambient
    // direction for the label, outline gap and validation text.
    final countrySelector = Directionality(
      textDirection: TextDirection.ltr,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextButton(
            key: const ValueKey('phone-country-selector'),
            onPressed: widget.enabled && !widget.readOnly
                ? _selectCountry
                : null,
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Semantics(
              label:
                  '${context.l10n.phoneCountryCode}: $countryName, $dialCode',
              excludeSemantics: true,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    country?.flagEmoji ?? '🌐',
                    style: const TextStyle(fontSize: 22, height: 1),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(dialCode),
                ],
              ),
            ),
          ),
          SizedBox(
            height: AppControlSizes.standardHeight - AppSpacing.lg,
            child: VerticalDivider(
              width: 1,
              thickness: 1,
              color: context.colors.border,
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
        ],
      ),
    );
    return TextFormField(
      key: widget.inputKey,
      contextMenuBuilder: appTextSelectionToolbar,
      controller: _controller,
      enabled: widget.enabled,
      readOnly: widget.readOnly,
      keyboardType: TextInputType.phone,
      inputFormatters: const [PhoneInputFormatter()],
      textDirection: TextDirection.ltr,
      autofillHints: const [AutofillHints.telephoneNumber],
      decoration: InputDecoration(
        labelText: widget.label,
        // Prefix/suffix are logical slots: choose the physical left slot.
        prefixIcon: rtl ? null : countrySelector,
        suffixIcon: rtl ? countrySelector : null,
        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
        suffixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
      ),
      validator: (value) =>
          InternationalPhone.e164(value ?? '', _country) != null
          ? null
          : context.l10n.authPhoneInvalid,
      onSaved: (value) =>
          widget.onSaved?.call(InternationalPhone.e164(value ?? '', _country)!),
      onChanged: (value) {
        final before = _country;
        _acceptInternationalInput();
        if (before != _country) setState(() {});
        widget.onCountryChanged?.call(_country);
      },
      onFieldSubmitted: widget.onFieldSubmitted,
    );
  }
}
