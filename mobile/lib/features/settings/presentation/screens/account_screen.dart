import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/widgets/work_app_bar.dart';

import '../../../../core/l10n/l10n_context.dart';
import 'account_view.dart';

/// The account & app-settings page.
///
/// The customer reaches it as a tab (no back button); delivery agents and monitors open
/// it as a pushed full-screen page (`/settings`, with a back button) instead of
/// a bottom sheet, so drilling into the profile editor stays consistent.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: workAppBar(
      context,
      ref,
      title: context.l10n.accountTitle,
      showAccountAction: false,
    ),
    body: const AccountView(),
  );
}
