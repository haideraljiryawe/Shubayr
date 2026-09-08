import 'package:flutter/material.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_card.dart';

class AdminVariantsEditor extends StatefulWidget {
  const AdminVariantsEditor({
    super.key,
    required this.value,
    required this.onChanged,
  });
  final List<Map<String, dynamic>> value;
  final ValueChanged<List<Map<String, dynamic>>> onChanged;
  @override
  State<AdminVariantsEditor> createState() => _AdminVariantsEditorState();
}

class _Variant {
  _Variant(Map<String, dynamic> json)
    : sku = TextEditingController(text: json['sku']?.toString() ?? ''),
      delta = TextEditingController(
        text: json['price_delta']?.toString() ?? '0',
      ),
      attributes = [
        for (final entry in (json['attributes'] as Map? ?? {}).entries)
          (
            TextEditingController(text: entry.key.toString()),
            TextEditingController(text: entry.value.toString()),
          ),
      ];
  final TextEditingController sku, delta;
  final List<(TextEditingController, TextEditingController)> attributes;
  Map<String, dynamic> json() => {
    'sku': sku.text.trim(),
    'price_delta': num.tryParse(delta.text) ?? 0,
    'attributes': {
      for (final (key, value) in attributes)
        if (key.text.trim().isNotEmpty) key.text.trim(): value.text.trim(),
    },
  };
  void dispose() {
    sku.dispose();
    delta.dispose();
    for (final (key, value) in attributes) {
      key.dispose();
      value.dispose();
    }
  }
}

class _AdminVariantsEditorState extends State<AdminVariantsEditor> {
  late final _variants = widget.value.map(_Variant.new).toList();
  final _retiredVariants = <_Variant>[];
  final _retiredAttributes = <(TextEditingController, TextEditingController)>[];
  void _notify() => widget.onChanged(_variants.map((v) => v.json()).toList());
  @override
  void dispose() {
    for (final variant in [..._variants, ..._retiredVariants]) {
      variant.dispose();
    }
    for (final (key, value) in _retiredAttributes) {
      key.dispose();
      value.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.adminVariants, style: context.text.titleSmall),
        for (final variant in _variants)
          Padding(
            key: ObjectKey(variant),
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: AppCard(
              child: Column(
                children: [
                  TextFormField(
                    controller: variant.sku,
                    decoration: InputDecoration(labelText: l.adminSku),
                    onChanged: (_) => _notify(),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  TextFormField(
                    controller: variant.delta,
                    decoration: InputDecoration(labelText: l.adminPriceDelta),
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                      signed: true,
                    ),
                    validator: (v) => num.tryParse(v ?? '')?.isFinite != true
                        ? l.adminInvalidNumber
                        : null,
                    onChanged: (_) => _notify(),
                  ),
                  for (final attribute in variant.attributes)
                    Padding(
                      key: ObjectKey(attribute.$1),
                      padding: const EdgeInsets.only(top: AppSpacing.md),
                      child: Column(
                        children: [
                          TextFormField(
                            controller: attribute.$1,
                            decoration: InputDecoration(
                              labelText: l.adminAttributeName,
                            ),
                            onChanged: (_) => _notify(),
                            validator: (v) => (v ?? '').trim().isEmpty
                                ? l.adminRequired
                                : null,
                          ),
                          TextFormField(
                            controller: attribute.$2,
                            decoration: InputDecoration(
                              labelText: l.adminAttributeValue,
                            ),
                            onChanged: (_) => _notify(),
                          ),
                          TextButton(
                            onPressed: () {
                              setState(
                                () => variant.attributes.remove(attribute),
                              );
                              _retiredAttributes.add(attribute);
                              _notify();
                            },
                            child: Text(l.actionDelete),
                          ),
                        ],
                      ),
                    ),
                  TextButton.icon(
                    onPressed: () {
                      setState(
                        () => variant.attributes.add((
                          TextEditingController(),
                          TextEditingController(),
                        )),
                      );
                      _notify();
                    },
                    icon: const Icon(Icons.add),
                    label: Text(l.adminAddAttribute),
                  ),
                  TextButton.icon(
                    onPressed: () {
                      setState(() => _variants.remove(variant));
                      _retiredVariants.add(variant);
                      _notify();
                    },
                    icon: const Icon(Icons.delete_outline),
                    label: Text(l.actionDelete),
                  ),
                ],
              ),
            ),
          ),
        TextButton.icon(
          onPressed: () {
            setState(() => _variants.add(_Variant({})));
            _notify();
          },
          icon: const Icon(Icons.add),
          label: Text(l.adminAddVariant),
        ),
      ],
    );
  }
}
