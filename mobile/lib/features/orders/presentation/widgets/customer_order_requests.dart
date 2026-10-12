import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../data/order.dart';
import '../../domain/order_repository.dart';
import '../order_status.dart';
import '../providers/order_action_providers.dart';
import '../providers/order_providers.dart';

/// Both customer decisions use the same order/session mutation guard as cancel.
class CustomerOrderRequests extends ConsumerStatefulWidget {
  const CustomerOrderRequests({super.key, required this.order});
  final Order order;

  @override
  ConsumerState<CustomerOrderRequests> createState() =>
      _CustomerOrderRequestsState();
}

class _CustomerOrderRequestsState extends ConsumerState<CustomerOrderRequests> {
  bool _confirming = false;

  Future<void> _act({ShortageDecision? decision}) async {
    final order = widget.order;
    if (_confirming ||
        ref.read(orderCancellationProvider(order.id)) ||
        order.version == null) {
      return;
    }
    final identity = ref.read(ordersIdentityProvider);
    final l10n = context.l10n;
    setState(() => _confirming = true);
    try {
      String? reason;
      if (decision == null) {
        reason = await showDialog<String>(
          context: context,
          builder: (ctx) =>
              _ownedDialog(ctx, identity, const _CancellationReasonDialog()),
        );
        if (reason == null) return;
      } else {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (ctx) => _ownedDialog(
            ctx,
            identity,
            AlertDialog(
              title: Text(l10n.orderReductionTitle),
              content: Text(
                decision == ShortageDecision.accepted
                    ? l10n.orderReductionAcceptConfirm
                    : l10n.orderReductionDeclineConfirm,
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(ctx, false),
                  child: Text(l10n.actionCancel),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: Text(l10n.actionContinue),
                ),
              ],
            ),
          ),
        );
        if (confirmed != true) return;
      }
      if (!mounted || ref.read(ordersIdentityProvider) != identity) return;
      // A refresh while a confirmation was open invalidates its displayed offer.
      final current = ref.read(orderProvider(order.id)).asData?.value;
      if (current == null || current.version != order.version) {
        ref.invalidate(orderProvider(order.id));
        showAppSnackBarMessage(context, message: l10n.orderStateConflict);
        return;
      }
      final controller = ref.read(orderCancellationProvider(order.id).notifier);
      final result = decision == null
          ? await controller.requestCancellation(
              version: order.version!,
              reason: reason!,
            )
          : await controller.respondToShortage(
              version: order.version!,
              decision: decision,
            );
      if (!mounted ||
          ref.read(ordersIdentityProvider) != identity ||
          ModalRoute.of(context)?.isCurrent == false) {
        return;
      }
      if (result.status == OrderActionStatus.succeeded) {
        showAppSnackBarMessage(
          context,
          message: decision == null
              ? l10n.orderCancellationRequestSent
              : l10n.orderDecisionSaved,
        );
      } else if (result.status == OrderActionStatus.failed) {
        final error = result.error;
        showAppSnackBarMessage(
          context,
          message: error is AppFailure
              ? (error.statusCode == 409
                    ? l10n.orderStateConflict
                    : error.localizedMessage(l10n))
              : l10n.stateErrorTitle,
        );
      }
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  Widget _ownedDialog(
    BuildContext dialogContext,
    Object? identity,
    Widget child,
  ) => Consumer(
    builder: (context, dialogRef, _) {
      dialogRef.listen(ordersIdentityProvider, (_, next) {
        if (next == identity || !dialogContext.mounted) return;
        final route = ModalRoute.of(dialogContext);
        if (route == null || !route.isActive) return;
        if (route.isCurrent) {
          Navigator.pop(dialogContext);
        } else {
          Navigator.of(dialogContext).removeRoute(route);
        }
      });
      return child;
    },
  );

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final l10n = context.l10n;
    final busy = ref.watch(orderCancellationProvider(order.id)) || _confirming;
    final enabled = !busy && order.version != null && order.version! > 0;
    final request = order.cancellationRequest;
    final proposal = order.attentionDetails?.reductionProposal;
    final pending = proposal?.status == 'pending';
    OrderItem? item;
    for (final candidate in order.items) {
      if (candidate.id == proposal?.orderItemId) item = candidate;
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (request != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(switch (request.status) {
            'pending' => l10n.orderCancellationPending,
            'approved' => l10n.orderCancellationApproved,
            'denied' => l10n.orderCancellationDenied,
            _ => l10n.orderStateConflict,
          }),
        ],
        if (canRequestOrderCancellation(order.status) &&
            request?.status != 'pending') ...[
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: l10n.orderRequestCancellation,
            variant: AppButtonVariant.secondary,
            onPressed: enabled ? () => _act() : null,
          ),
        ],
        if (pending && proposal != null) ...[
          const SizedBox(height: AppSpacing.lg),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(l10n.orderReductionTitle),
                if (item != null)
                  Text(
                    item.snapshotName(
                          Localizations.localeOf(context).languageCode,
                        ) ??
                        l10n.orderItemsSection,
                  ),
                Text(
                  l10n.orderReductionQuantities(
                    formatQuantity(proposal.oldQuantity),
                    formatQuantity(proposal.newQuantity),
                  ),
                ),
                Text(proposal.reason),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: l10n.orderReductionAccept,
                  onPressed: enabled && item != null
                      ? () => _act(decision: ShortageDecision.accepted)
                      : null,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: l10n.orderReductionDecline,
                  variant: AppButtonVariant.secondary,
                  onPressed: enabled && item != null
                      ? () => _act(decision: ShortageDecision.denied)
                      : null,
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _CancellationReasonDialog extends StatefulWidget {
  const _CancellationReasonDialog();
  @override
  State<_CancellationReasonDialog> createState() =>
      _CancellationReasonDialogState();
}

class _CancellationReasonDialogState extends State<_CancellationReasonDialog> {
  final _text = TextEditingController();
  final _form = GlobalKey<FormState>();
  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(context.l10n.orderRequestCancellation),
    content: SingleChildScrollView(
      child: Form(
        key: _form,
        child: TextFormField(
          controller: _text,
          autofocus: true,
          maxLength: 500,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(
            labelText: context.l10n.orderCancellationReason,
          ),
          validator: (value) => value == null || value.trim().isEmpty
              ? context.l10n.errorValidation
              : null,
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: Text(context.l10n.actionCancel),
      ),
      TextButton(
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, _text.text.trim());
          }
        },
        child: Text(context.l10n.actionContinue),
      ),
    ],
  );
}
