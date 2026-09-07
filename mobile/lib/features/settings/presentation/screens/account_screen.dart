import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import 'account_view.dart';

/// The account & app-settings page.
///
/// The customer reaches it as a tab (no back button); delivery and staff open
/// it as a pushed full-screen page (`/settings`, with a back button) instead of
/// a bottom sheet, so drilling into the profile editor stays consistent.
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.accountTitle)),
    body: const AccountView(),
  );
}
