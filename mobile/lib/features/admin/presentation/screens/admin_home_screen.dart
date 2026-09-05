import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/screens/account_screen.dart';

/// Admin/staff area — routing shell only (this is also the Flutter Web
/// target). Feature screens wait on the admin response schemas and on
/// `permissions[]` in the user contract.
class AdminHomeScreen extends StatelessWidget {
  const AdminHomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(context.l10n.adminTitle),
      actions: [
        IconButton(
          onPressed: () => showAccountSheet(context),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
      ],
    ),
    body: const ComingSoonView(icon: Icons.dashboard_outlined),
  );
}
