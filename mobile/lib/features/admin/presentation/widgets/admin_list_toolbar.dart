import 'package:flutter/material.dart';
import '../../../../core/layout/app_layout.dart';

/// The same filter fields wrap naturally on phones, tablets and wide windows.
/// Resource creation stays in the screen's floating action button.
class AdminListToolbar extends StatelessWidget {
  const AdminListToolbar({super.key, required this.fields});
  final List<Widget> fields;

  @override
  Widget build(BuildContext context) => fields.isEmpty
      ? const SizedBox.shrink()
      : Padding(
          padding: AppLayout.pageInsets(context),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: ResponsiveFields(children: fields),
          ),
        );
}
