import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import 'account_view.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.accountTitle)),
    body: const AccountView(),
  );
}

/// Opens the same account controls from areas that have no account tab.
Future<void> showAccountSheet(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: 0.75,
        child: SafeArea(child: AccountView()),
      ),
    );
