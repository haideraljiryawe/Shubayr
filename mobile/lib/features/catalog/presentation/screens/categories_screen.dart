import 'package:flutter/material.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/state_views.dart';

/// Departments / categories browse.
///
/// Placeholder for now — the catalog is its own feature phase. This exists so
/// the guest bottom navigation has three destinations that route correctly.
class CategoriesScreen extends StatelessWidget {
  const CategoriesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.categoriesTitle)),
    body: const ComingSoonView(icon: Icons.grid_view_outlined),
  );
}
