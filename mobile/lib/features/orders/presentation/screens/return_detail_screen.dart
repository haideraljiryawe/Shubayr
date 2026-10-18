import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/l10n/generated/app_localizations.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/display_date.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../data/return_request.dart';
import '../providers/after_sales_providers.dart';

String returnStatusLabel(AppLocalizations l10n, String status) =>
    switch (status) {
      'requested' => l10n.returnRequested,
      'approved' => l10n.returnApproved,
      'partially_approved' => l10n.returnPartiallyApproved,
      'rejected' => l10n.returnRejected,
      'received' => l10n.returnReceived,
      'inspected' => l10n.returnInspected,
      'refunded' => l10n.returnRefunded,
      'completed' => l10n.returnCompleted,
      _ => status,
    };
String returnReasonLabel(AppLocalizations l10n, String reason) =>
    switch (reason) {
      'change_of_mind' => l10n.returnChangeMind,
      'defect' => l10n.returnDefect,
      'store_error' => l10n.returnStoreError,
      'wrong_item' => l10n.returnWrongItem,
      _ => l10n.returnOther,
    };

class ReturnDetailScreen extends ConsumerWidget {
  const ReturnDetailScreen({super.key, required this.returnId});
  final String returnId;
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
    appBar: AppBar(title: Text(context.l10n.returnDetailsTitle)),
    body: ResponsiveContent.page(
      child: AsyncValueView(
        value: ref.watch(returnDetailProvider(returnId)),
        loading: const SkeletonCardList(),
        onRetry: () => ref.invalidate(returnDetailProvider(returnId)),
        builder: (context, request) => RefreshIndicator(
          onRefresh: () async {
            await ref
                .refresh(returnDetailProvider(returnId).future)
                .then<void>((_) {}, onError: (Object _, StackTrace _) {});
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: AppLayout.pageInsets(context),
            children: [ReturnDetails(request: request)],
          ),
        ),
      ),
    ),
  );
}

/// Monetary amounts are immutable API snapshots, never recalculated estimates.
class ReturnDetails extends StatelessWidget {
  const ReturnDetails({super.key, required this.request});
  final ReturnRequest request;
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final lang = Localizations.localeOf(context).languageCode;
    String money(num amount) =>
        formatMoney(amount, currencyCode: request.currency!, localeCode: lang);
    Widget value(String label, String text) => Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Text('$label: $text'),
    );
    final points = request.pointsEffect;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(request.documentNumber ?? request.id),
        Text(returnStatusLabel(l10n, request.status)),
        if (request.reason?.isNotEmpty == true) Text(request.reason!),
        if (request.currency != null) ...[
          if (request.expectedRefund != null)
            value(l10n.returnExpectedRefund, money(request.expectedRefund!)),
          if (request.refundAmount != null)
            value(l10n.returnApprovedRefund, money(request.refundAmount!)),
          if (request.deliveryFeeRefund != null)
            value(l10n.returnDeliveryRefund, money(request.deliveryFeeRefund!)),
          if (request.uncollectedOffset != null)
            value(
              l10n.returnUncollectedOffset,
              money(request.uncollectedOffset!),
            ),
          if (request.cashRefundAmount != null)
            value(l10n.returnCashRefund, money(request.cashRefundAmount!)),
        ],
        if (points != null) ...[
          const SizedBox(height: AppSpacing.md),
          value(l10n.returnEarnedReversed, '${points.earnedReversed}'),
          value(l10n.returnRedeemedRestored, '${points.redeemedRestored}'),
          value(l10n.returnNetPoints, '${points.net}'),
          Text(l10n.returnPointsNote),
        ],
        for (final item in request.items) ...[
          const Divider(),
          Text(
            (lang == 'ar'
                    ? item.productNameAr ?? item.productNameEn
                    : item.productNameEn ?? item.productNameAr) ??
                item.orderItemId,
          ),
          value(
            l10n.returnRequestedQuantity,
            '${formatQuantity(item.quantity)} ${item.baseUnit ?? ''}'.trim(),
          ),
          if (item.approvedQuantity != null)
            value(
              l10n.returnApprovedQuantity,
              formatQuantity(item.approvedQuantity!),
            ),
          if (item.reasonCode != null)
            Text(returnReasonLabel(l10n, item.reasonCode!)),
          if (item.reason != null) Text(item.reason!),
          if (request.currency != null && item.netAmount != null)
            value(l10n.returnExpectedRefund, money(item.netAmount!)),
          if (request.currency != null && item.approvedRefund != null)
            value(l10n.returnApprovedRefund, money(item.approvedRefund!)),
        ],
        if (request.events.isNotEmpty) ...[
          const Divider(),
          Text(l10n.returnTimeline),
          for (final event in request.events)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(returnStatusLabel(l10n, event.type)),
              subtitle: Text(
                [
                  DisplayDate.localDateTime(event.createdAt),
                  if (event.note?.isNotEmpty == true) event.note!,
                ].join('\n'),
              ),
            ),
        ],
        if (request.refundPayments.isNotEmpty) ...[
          const Divider(),
          Text(l10n.returnPayments),
          for (final payment in request.refundPayments)
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                formatMoney(
                  payment.amountIqd,
                  currencyCode: 'IQD',
                  localeCode: lang,
                ),
              ),
              subtitle: Text(
                [
                  payment.method == 'delivery_custody'
                      ? l10n.returnDeliveryCustody
                      : l10n.returnCashAccount,
                  DisplayDate.localDateTime(payment.createdAt),
                  if (payment.proofReference != null) payment.proofReference!,
                ].join('\n'),
              ),
            ),
        ],
      ],
    );
  }
}
