import '../../../../core/utils/international_phone.dart';
import '../../../../core/widgets/phone_number_text.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/utils/currency_formatter.dart';
import '../../../../core/utils/display_date.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../settings/presentation/providers/privacy_policy_provider.dart';
import '../../data/delivery.dart';
import '../../data/delivery_detail.dart';
import '../delivery_status.dart';
import '../providers/delivery_providers.dart';
import '../widgets/delivery_collection_summary.dart';

class DeliveryDetailScreen extends ConsumerStatefulWidget {
  const DeliveryDetailScreen({
    super.key,
    required this.deliveryId,
    this.fromList = false,
  });
  final String deliveryId;
  // Reuse the already loaded list's collection/attempt summary. Deep links
  // fetch only the detail endpoint, never all list pages to find this row.
  final bool fromList;
  @override
  ConsumerState<DeliveryDetailScreen> createState() =>
      _DeliveryDetailScreenState();
}

class _DeliveryDetailScreenState extends ConsumerState<DeliveryDetailScreen> {
  late final AppLifecycleListener _lifecycle;
  bool _refreshing = false;
  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(
      onResume: () {
        if (mounted && ModalRoute.of(context)?.isCurrent == true) {
          _refresh();
        }
      },
    );
  }

  @override
  void dispose() {
    _lifecycle.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      await Future.wait<void>([
        ref
            .refresh(deliveryDetailProvider(widget.deliveryId).future)
            .then<void>((_) {}, onError: (Object _, StackTrace _) {}),
        if (widget.fromList) ref.read(deliveriesProvider.notifier).refresh(),
      ]);
    } finally {
      _refreshing = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    if (widget.fromList) {
      ref.listen(deliveriesProvider, (previous, next) {
        if (_refreshing || next.asData == null) return;
        final old = previous?.asData?.value.items
            .where((d) => d.id == widget.deliveryId)
            .firstOrNull;
        final current = next.asData!.value.items
            .where((d) => d.id == widget.deliveryId)
            .firstOrNull;
        if (old != null &&
            (current == null ||
                old.status != current.status ||
                old.orderVersion != current.orderVersion)) {
          ref.invalidate(deliveryDetailProvider(widget.deliveryId));
        }
      });
    }
    final value = ref.watch(deliveryDetailProvider(widget.deliveryId));
    final list = widget.fromList ? ref.watch(deliveriesProvider) : null;
    final summary = list?.asData?.value.items
        .where((d) => d.id == widget.deliveryId)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(l.deliveryDetailsTitle)),
      body: ResponsiveContent.page(
        child: value.when(
          // Clear contact content during revalidation, including manual refresh.
          skipLoadingOnRefresh: false,
          skipLoadingOnReload: false,
          loading: () => const SkeletonCardList(),
          error: (error, _) =>
              error is AppFailure &&
                  (error.statusCode == 404 ||
                      error.statusCode == 403 ||
                      error.kind == FailureKind.notFound)
              ? AppEmptyView(
                  title: l.deliveryDetailUnavailable,
                  message: l.deliveryDetailUnavailableHint,
                )
              : AppErrorView(error: error, onRetry: _refresh),
          data: (detail) => RefreshIndicator(
            onRefresh: _refresh,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: AppLayout.pageInsets(context),
              children: [
                DeliveryDetailContent(
                  detail: detail,
                  summary:
                      summary?.orderVersion == detail.orderVersion &&
                          summary?.status == detail.status
                      ? summary
                      : null,
                  hideContact:
                      list?.isLoading == true ||
                      list?.hasError == true ||
                      (summary != null &&
                          ((summary.orderVersion ?? 0) > detail.orderVersion ||
                              (summary.orderVersion == detail.orderVersion &&
                                  summary.status != detail.status))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class DeliveryDetailContent extends ConsumerWidget {
  const DeliveryDetailContent({
    super.key,
    required this.detail,
    this.summary,
    this.hideContact = false,
  });
  final DeliveryDetail detail;
  final Delivery? summary;
  final bool hideContact;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = context.l10n;
    final ar = Localizations.localeOf(context).languageCode == 'ar';
    String money(num amount, [String? currency]) => formatMoney(
      amount,
      currencyCode: currency ?? detail.currency,
      localeCode: ar ? 'ar' : 'en',
    );
    Widget section(String title, List<Widget> children) => Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: context.text.titleMedium),
            const SizedBox(height: AppSpacing.md),
            ...children,
          ],
        ),
      ),
    );
    Future<void> copy(String value) async {
      try {
        await Clipboard.setData(ClipboardData(text: value));
        if (context.mounted) {
          showAppSnackBarMessage(context, message: l.deliveryCopied);
        }
      } catch (_) {
        if (context.mounted) {
          showAppSnackBarMessage(context, message: l.deliveryActionFailed);
        }
      }
    }

    Future<void> open(Uri uri) async {
      var opened = false;
      try {
        opened = await ref.read(externalLinkLauncherProvider)(uri);
      } catch (_) {
        /* localized feedback */
      }
      if (!opened && context.mounted) {
        showAppSnackBarMessage(context, message: l.deliveryActionFailed);
      }
    }

    final contactVisible = detail.contactVisible && !hideContact;
    final address = contactVisible ? detail.shippingAddress : null;
    final phone = contactVisible ? detail.recipientPhone : null;
    final phoneUri = phone == null ? null : InternationalPhone.callUri(phone);
    final canCall = phoneUri != null;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        section(l.deliveryDetailsTitle, [
          SelectableText(
            detail.orderNumber,
            textDirection: TextDirection.ltr,
            style: context.text.titleLarge,
          ),
          Text(deliveryStatusLabel(l, detail.status)),
          TextButton.icon(
            onPressed: () => copy(detail.orderNumber),
            icon: const Icon(Icons.copy_outlined),
            label: Text(l.deliveryCopyReference),
          ),
        ]),
        section(l.deliveryRecipientTitle, [
          if (!contactVisible)
            Text(l.deliveryContactHidden)
          else ...[
            Text(
              detail.recipientName?.trim().isNotEmpty == true
                  ? detail.recipientName!
                  : l.deliveryNameUnavailable,
            ),
            if (phone?.isNotEmpty == true) ...[
              PhoneNumberText(phone!, selectable: true),
              if (canCall)
                TextButton.icon(
                  onPressed: () => open(phoneUri),
                  icon: const Icon(Icons.call_outlined),
                  label: Text(l.deliveryCallRecipient),
                ),
            ] else
              Text(l.deliveryPhoneUnavailable),
            if (address != null && address.lines.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              SelectableText(address.lines.join('\n')),
              Wrap(
                spacing: AppSpacing.sm,
                children: [
                  TextButton.icon(
                    onPressed: () => copy(address.lines.join('\n')),
                    icon: const Icon(Icons.copy_outlined),
                    label: Text(l.deliveryCopyAddress),
                  ),
                  if (address.hasCoordinates)
                    TextButton.icon(
                      onPressed: () => open(
                        Uri.https('www.google.com', '/maps/search/', {
                          'api': '1',
                          'query': '${address.lat},${address.lng}',
                        }),
                      ),
                      icon: const Icon(Icons.map_outlined),
                      label: Text(l.deliveryOpenMap),
                    ),
                ],
              ),
            ] else
              Text(l.deliveryAddressUnavailable),
          ],
        ]),
        section(l.orderItemsSection, [
          for (final item in detail.items) ...[
            Text(
              (ar ? item.productNameAr : item.productNameEn).trim().isNotEmpty
                  ? (ar ? item.productNameAr : item.productNameEn)
                  : (ar ? item.productNameEn : item.productNameAr),
              style: context.text.titleSmall,
            ),
            Text(item.variantSku, textDirection: TextDirection.ltr),
            if (item.variantAttributes != null)
              for (final attribute in item.variantAttributes!.entries)
                if (attribute.value is String ||
                    attribute.value is num ||
                    attribute.value is bool)
                  Text('${attribute.key}: ${attribute.value}'),
            Text(
              '${formatQuantity(item.quantity)} ${item.baseUnit} × ${money(item.unitPrice, item.currency)}',
            ),
            Text(
              '${l.deliveryLineTotal}: ${money(item.lineTotal, item.currency)}',
            ),
            const Divider(),
          ],
        ]),
        section(l.deliveryInvoiceTitle, [
          Text(
            '${l.deliveryOrderTotal}: ${money(detail.amountDue)}',
            style: context.text.titleMedium,
          ),
          Text(l.deliveryTotalNotBalance),
          if (summary != null)
            Text(
              '${l.deliveryFee}: ${money(summary!.deliveryFee, summary!.currency)}',
            ),
          Text(l.deliveryInvoiceBreakdownUnavailable),
          const SizedBox(height: AppSpacing.md),
          DeliveryCollectionSummary(collection: summary?.collection),
        ]),
        if (summary != null &&
            (summary!.dispatchedAt != null ||
                summary!.deliveredAt != null ||
                summary!.failureReason != null ||
                summary!.retryCount > 0))
          section(l.deliveryHistoryTitle, [
            if (summary!.dispatchedAt != null)
              Text(
                '${l.deliveryDispatchedAt}: ${DisplayDate.localDateTime(summary!.dispatchedAt!)}',
              ),
            if (summary!.deliveredAt != null)
              Text(
                '${l.deliveryDeliveredAt}: ${DisplayDate.localDateTime(summary!.deliveredAt!)}',
              ),
            if (summary!.failureReason != null)
              Text('${l.deliveryFailureReason}: ${summary!.failureReason}'),
            if (summary!.retryCount > 0)
              Text('${l.deliveryRetryCount}: ${summary!.retryCount}'),
          ]),
      ],
    );
  }
}
