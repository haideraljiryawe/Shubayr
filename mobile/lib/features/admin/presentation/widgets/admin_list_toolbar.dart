import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';

/// Shared by the resource lists. Fields stay mounted when resizing; actions
/// move to the toolbar only in desktop windows. The screen owns the mobile FAB.
class AdminListToolbar extends StatelessWidget {
  const AdminListToolbar({super.key, required this.fields, this.onAdd});
  final List<Widget> fields;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    final desktop = AppLayout.isDesktop(context);
    if (fields.isEmpty && (!desktop || onAdd == null)) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: AppLayout.pageInsets(context),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final fieldWidth = desktop
              ? math.min(
                  AppLayout.fieldMinWidth * AppLayout.textScale(context),
                  constraints.maxWidth,
                )
              : constraints.maxWidth;
          return Align(
            alignment: AlignmentDirectional.centerStart,
            child: Wrap(
              spacing: AppSpacing.md,
              runSpacing: AppSpacing.md,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                for (var i = 0; i < fields.length; i++)
                  SizedBox(
                    key: ValueKey(i),
                    width: fieldWidth,
                    child: fields[i],
                  ),
                if (desktop && onAdd != null)
                  AppButton(
                    key: const ValueKey('admin-toolbar-add'),
                    label: context.l10n.adminAdd,
                    icon: Icons.add,
                    expand: false,
                    onPressed: onAdd,
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
