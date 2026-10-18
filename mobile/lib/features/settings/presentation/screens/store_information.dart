import '../../../../core/utils/international_phone.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/utils/display_date.dart';
import '../providers/settings_providers.dart';
import '../providers/privacy_policy_provider.dart';
import '../providers/support_provider.dart';

class StoreInformation extends ConsumerWidget {
  const StoreInformation({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(storeSettingsProvider);
    if (settings == null) return const SizedBox.shrink();
    final l10n = context.l10n;
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    String? text(String? arabic, String? english) =>
        ar ? arabic ?? english : english ?? arabic;
    final name = text(settings.storeLegalNameAr, settings.storeLegalNameEn);
    final address = text(settings.storeAddressAr, settings.storeAddressEn);
    final hours = text(settings.supportHoursAr, settings.supportHoursEn);
    final policyDate = DateTime.tryParse(settings.policyEffectiveDate ?? '');
    Widget link(
      String label,
      String display,
      String destination, {
      bool phone = false,
    }) => ListTile(
      title: Text(label),
      subtitle: Text(
        phone ? InternationalPhone.display(display) : display,
        textDirection: phone ? TextDirection.ltr : null,
      ),
      onTap: () async {
        final uri = supportUri(destination);
        var opened = false;
        try {
          if (uri != null) {
            opened = await ref.read(externalLinkLauncherProvider)(uri);
          }
        } catch (_) {
          /* Localized feedback below. */
        }
        if (!opened && context.mounted) {
          showAppSnackBarMessage(context, message: l10n.supportOpenFailed);
        }
      },
    );
    if ([
      name,
      address,
      hours,
      settings.supportPhone,
      settings.supportWhatsapp,
      settings.supportEmail,
      settings.privacyEmail,
      settings.policyEffectiveDate,
      settings.refundDays,
      settings.returnWindowDays,
    ].every((value) => value == null)) {
      return const SizedBox.shrink();
    }
    return ExpansionTile(
      title: Text(l10n.storeInfoTitle),
      children: [
        if (name != null) ListTile(title: Text(name)),
        if (address != null)
          ListTile(title: Text(l10n.storeAddress), subtitle: Text(address)),
        if (hours != null)
          ListTile(title: Text(l10n.storeSupportHours), subtitle: Text(hours)),
        if (settings.supportPhone != null)
          link(
            l10n.storeSupportPhone,
            settings.supportPhone!,
            InternationalPhone.callUri(settings.supportPhone!)?.toString() ??
                '',
            phone: true,
          ),
        if (settings.supportWhatsapp != null)
          link(
            l10n.storeSupportWhatsapp,
            settings.supportWhatsapp!,
            'https://wa.me/${settings.supportWhatsapp!.replaceFirst('+', '')}',
            phone: true,
          ),
        if (settings.supportEmail != null)
          link(
            l10n.storeSupportEmail,
            settings.supportEmail!,
            'mailto:${settings.supportEmail}',
          ),
        if (settings.privacyEmail != null)
          link(
            l10n.storePrivacyEmail,
            settings.privacyEmail!,
            'mailto:${settings.privacyEmail}',
          ),
        if (settings.returnWindowDays != null)
          ListTile(
            title: Text(l10n.storeReturnWindow('${settings.returnWindowDays}')),
          ),
        if (settings.refundDays != null)
          ListTile(title: Text(l10n.storeRefundDays('${settings.refundDays}'))),
        if (policyDate != null)
          ListTile(
            title: Text(l10n.storePolicyDate),
            subtitle: Text(DisplayDate.calendarDate(policyDate)),
          ),
      ],
    );
  }
}
