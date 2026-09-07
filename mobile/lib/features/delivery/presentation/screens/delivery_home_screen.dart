import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/router/app_routes.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/widgets/state_views.dart';

/// Delivery agent area — routing shell only.
///
/// `GET /deliveries/assigned` has no response schema in `api/openapi.yaml`,
/// so no models, repository or screens are built for it yet.
class DeliveryHomeScreen extends StatelessWidget {
  const DeliveryHomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(context.l10n.deliveryTitle),
      actions: [
        IconButton(
          onPressed: () => context.push(AppRoutes.settings),
          icon: const Icon(Icons.person_outline),
          tooltip: context.l10n.accountTitle,
        ),
      ],
    ),
    body: const ComingSoonView(icon: Icons.local_shipping_outlined),
  );
}
