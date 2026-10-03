import '../../../../core/widgets/quantity_stepper.dart';
import '../../../../core/utils/quantity.dart';
import '../../../../core/layout/app_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/error/failure.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_button.dart';
import '../../../../core/widgets/app_card.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../../../core/widgets/state_views.dart';
import '../../../catalog/data/product.dart';
import '../../../catalog/presentation/providers/catalog_providers.dart';
import '../../data/order.dart';
import '../../data/return_request.dart';
import '../providers/after_sales_providers.dart';
import '../providers/order_providers.dart';
import '../widgets/order_item_display.dart';

class ReviewOrderScreen extends ConsumerWidget {
  const ReviewOrderScreen({super.key, required this.orderId});
  final String orderId;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _ReviewOrderForm(
    key: ValueKey((orderId, ref.watch(ordersIdentityProvider))),
    orderId: orderId,
  );
}

class _ReviewOrderForm extends ConsumerStatefulWidget {
  const _ReviewOrderForm({super.key, required this.orderId});
  final String orderId;
  @override
  ConsumerState<_ReviewOrderForm> createState() => _ReviewOrderScreenState();
}

class _ReviewOrderScreenState extends ConsumerState<_ReviewOrderForm> {
  final _comment = TextEditingController();
  String? _itemId;
  int _rating = 0;
  bool _busy = false;
  bool _sent = false;
  AppFailure? _error;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit(OrderItem item) async {
    if (_busy || _rating == 0) return;
    setState(() {
      _busy = true;
      _error = null;
      _sent = false;
    });
    try {
      final review = await ref
          .read(reviewEligibilityProvider(widget.orderId).notifier)
          .submit(
            item: item,
            rating: _rating,
            comment: _comment.text.trim().isEmpty ? null : _comment.text.trim(),
          );
      if (!mounted || review == null) return;
      setState(() {
        _sent = true;
        _rating = 0;
        _itemId = null;
      });
      _comment.clear();
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is AppFailure ? e : const AppFailure.unknown(),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.reviewOrderTitle)),
        body: _AfterSalesOrderView(
          orderId: widget.orderId,
          builder: (order, products) => AsyncValueView<Set<String>>(
            value: ref.watch(reviewEligibilityProvider(widget.orderId)),
            loading: const SkeletonCardList(),
            onRetry: () =>
                ref.invalidate(reviewEligibilityProvider(widget.orderId)),
            builder: (context, eligible) {
              final available = order.items
                  .where((i) => eligible.contains(i.id))
                  .toList();
              final selected = available
                  .where((i) => i.id == _itemId)
                  .firstOrNull;
              return ResponsiveContent(
                child: ListView(
                  padding: AppLayout.pageInsets(context),
                  children: [
                    Text(order.orderNumber, style: context.text.titleMedium),
                    const SizedBox(height: AppSpacing.md),
                    Text(l10n.reviewOrderHint),
                    if (_sent) ...[
                      const SizedBox(height: AppSpacing.md),
                      _SuccessMessage(l10n.reviewSubmitted),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    if (available.isEmpty)
                      Text(l10n.reviewAllSubmitted)
                    else ...[
                      DropdownButtonFormField<String>(
                        key: ValueKey('review-item-${eligible.join(',')}'),
                        initialValue: selected?.id,
                        isExpanded: true,
                        decoration: InputDecoration(
                          labelText: l10n.reviewChooseProduct,
                        ),
                        items: [
                          for (final i in available)
                            DropdownMenuItem(
                              value: i.id,
                              child: Text(
                                _itemLabel(context, i, products),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                        onChanged: _busy
                            ? null
                            : (id) => setState(() {
                                _itemId = id;
                                _rating = 0;
                                _error = null;
                                _sent = false;
                                _comment.clear();
                              }),
                      ),
                      const SizedBox(height: AppSpacing.lg),
                      Text(l10n.reviewRating, style: context.text.titleSmall),
                      Wrap(
                        children: [
                          for (var n = 1; n <= 5; n++)
                            Semantics(
                              selected: _rating == n,
                              child: IconButton(
                                tooltip: l10n.reviewStars('$n'),
                                onPressed: _busy
                                    ? null
                                    : () => setState(() => _rating = n),
                                color: context.colors.primary,
                                icon: Icon(
                                  n <= _rating ? Icons.star : Icons.star_border,
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      TextField(
                        controller: _comment,
                        enabled: !_busy,
                        minLines: 3,
                        maxLines: 5,
                        decoration: InputDecoration(
                          labelText: l10n.reviewComment,
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          _error!.localizedMessage(l10n),
                          style: context.text.bodyMedium?.copyWith(
                            color: context.colors.danger,
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: l10n.reviewSubmit,
                        isLoading: _busy,
                        onPressed: selected == null || _rating == 0 || _busy
                            ? null
                            : () => _submit(selected),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class ReturnOrderScreen extends ConsumerWidget {
  const ReturnOrderScreen({super.key, required this.orderId});
  final String orderId;
  @override
  Widget build(BuildContext context, WidgetRef ref) => _ReturnOrderForm(
    key: ValueKey((orderId, ref.watch(ordersIdentityProvider))),
    orderId: orderId,
  );
}

class _ReturnOrderForm extends ConsumerStatefulWidget {
  const _ReturnOrderForm({super.key, required this.orderId});
  final String orderId;
  @override
  ConsumerState<_ReturnOrderForm> createState() => _ReturnOrderScreenState();
}

class _ReturnOrderScreenState extends ConsumerState<_ReturnOrderForm> {
  final _reason = TextEditingController();
  final Map<String, num> _quantities = {};
  bool _busy = false;
  ReturnRequest? _submitted;
  AppFailure? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  num _quantity(String itemId, ReturnEligibility eligibility) =>
      (_quantities[itemId] ?? 0).clamp(0, eligibility.remaining[itemId] ?? 0);

  Future<void> _submit(ReturnEligibility eligibility) async {
    if (_busy || !_quantities.values.any((n) => n > 0)) return;
    if (_reason.text.trim().isEmpty || _reason.text.trim().length > 1000) {
      setState(() => _error = const AppFailure(FailureKind.validation));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final request = await ref
          .read(returnEligibilityProvider(widget.orderId).notifier)
          .submit(
            reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
            items: [
              for (final id in eligibility.remaining.keys)
                if (_quantity(id, eligibility) > 0)
                  ReturnRequestItem(
                    orderItemId: id,
                    quantity: _quantity(id, eligibility),
                  ),
            ],
          );
      if (!mounted || request == null) return;
      setState(() => _submitted = request);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = e is AppFailure ? e : const AppFailure.unknown(),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.returnOrderTitle)),
        body: _AfterSalesOrderView(
          orderId: widget.orderId,
          builder: (order, products) => AsyncValueView<ReturnEligibility>(
            value: ref.watch(returnEligibilityProvider(widget.orderId)),
            loading: const SkeletonCardList(),
            onRetry: () =>
                ref.invalidate(returnEligibilityProvider(widget.orderId)),
            builder: (context, eligibility) {
              final submitted = _submitted;
              if (submitted != null) {
                return ResponsiveContent(
                  child: ListView(
                    padding: AppLayout.pageInsets(context),
                    children: [
                      _SuccessMessage(l10n.returnSubmitted),
                      const SizedBox(height: AppSpacing.md),
                      Text(l10n.returnReference(submitted.id)),
                      const SizedBox(height: AppSpacing.md),
                      for (final line in submitted.items)
                        ListTile(
                          title: Text(
                            _itemLabel(
                              context,
                              order.items.firstWhere(
                                (i) => i.id == line.orderItemId,
                              ),
                              products,
                            ),
                          ),
                          subtitle: Text(
                            l10n.orderLineQuantity(
                              formatQuantity(line.quantity),
                            ),
                          ),
                        ),
                      if (submitted.reason != null) Text(submitted.reason!),
                      const SizedBox(height: AppSpacing.lg),
                      Text(l10n.returnRequestOnly),
                    ],
                  ),
                );
              }
              final available = order.items
                  .where((i) => (eligibility.remaining[i.id] ?? 0) > 0)
                  .toList();
              return ResponsiveContent(
                child: ListView(
                  padding: AppLayout.pageInsets(context),
                  children: [
                    Text(order.orderNumber, style: context.text.titleMedium),
                    const SizedBox(height: AppSpacing.md),
                    Text(l10n.returnOrderHint),
                    const SizedBox(height: AppSpacing.lg),
                    if (available.isEmpty) Text(l10n.returnAllRequested),
                    for (final item in available) ...[
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _itemLabel(context, item, products),
                              style: context.text.titleSmall,
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Text(
                              l10n.returnAvailable(
                                formatQuantity(eligibility.remaining[item.id]!),
                              ),
                            ),
                            Row(
                              children: [
                                IconButton(
                                  tooltip: l10n.returnDecrease,
                                  onPressed:
                                      _busy ||
                                          (_quantity(item.id, eligibility)) == 0
                                      ? null
                                      : () => setState(
                                          () => _quantities[item.id] =
                                              subtractQuantity(
                                                _quantity(item.id, eligibility),
                                                1,
                                              ).clamp(
                                                0,
                                                eligibility.remaining[item.id]!,
                                              ),
                                        ),
                                  icon: const Icon(Icons.remove),
                                ),
                                InkWell(
                                  onTap: _busy
                                      ? null
                                      : () async {
                                          final quantity = await editQuantity(
                                            context,
                                            quantity: _quantity(
                                              item.id,
                                              eligibility,
                                            ),
                                            min: 0,
                                            max:
                                                eligibility.remaining[item.id]!,
                                          );
                                          if (mounted && quantity != null) {
                                            setState(
                                              () => _quantities[item.id] =
                                                  quantity,
                                            );
                                          }
                                        },
                                  child: Text(
                                    formatQuantity(
                                      _quantity(item.id, eligibility),
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: l10n.returnIncrease,
                                  onPressed:
                                      _busy ||
                                          (_quantity(item.id, eligibility)) >=
                                              eligibility.remaining[item.id]!
                                      ? null
                                      : () => setState(
                                          () => _quantities[item.id] =
                                              addQuantity(
                                                _quantity(item.id, eligibility),
                                                1,
                                              ).clamp(
                                                0,
                                                eligibility.remaining[item.id]!,
                                              ),
                                        ),
                                  icon: const Icon(Icons.add),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                    ],
                    if (available.isNotEmpty) ...[
                      TextField(
                        controller: _reason,
                        maxLength: 1000,
                        enabled: !_busy,
                        minLines: 3,
                        maxLines: 5,
                        decoration: InputDecoration(
                          labelText: l10n.returnReason,
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          _error!.localizedMessage(l10n),
                          style: context.text.bodyMedium?.copyWith(
                            color: context.colors.danger,
                          ),
                        ),
                      ],
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        label: l10n.returnSubmit,
                        isLoading: _busy,
                        onPressed:
                            !_busy &&
                                available.any(
                                  (i) => _quantity(i.id, eligibility) > 0,
                                )
                            ? () => _submit(eligibility)
                            : null,
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Both forms require a delivered order and its product labels. They also
/// protect direct links; hiding a button alone is not an eligibility check.
class _AfterSalesOrderView extends ConsumerWidget {
  const _AfterSalesOrderView({required this.orderId, required this.builder});
  final String orderId;
  final Widget Function(Order, Map<String, Product>) builder;
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loading = Padding(
      padding: AppLayout.pageInsets(context),
      child: SkeletonCardList(),
    );
    return AsyncValueView(
      value: ref.watch(orderProvider(orderId)),
      loading: loading,
      onRetry: () => ref.invalidate(orderProvider(orderId)),
      builder: (context, order) {
        if (order.status != 'delivered') {
          return AppEmptyView(
            icon: Icons.local_shipping_outlined,
            message: context.l10n.afterSalesDeliveredOnly,
          );
        }
        final products = ref.watch(orderProductsProvider(orderId));
        if (order.items.every((item) => item.snapshotName('en') != null)) {
          // Saved names are immediately usable even if variant enrichment is
          // slow or the current catalog has removed the product.
          return builder(order, products.value ?? const {});
        }
        return AsyncValueView(
          value: products,
          loading: loading,
          onRetry: () {
            for (final item in order.items) {
              ref.invalidate(productProvider(item.productId));
            }
            ref.invalidate(orderProductsProvider(orderId));
          },
          builder: (_, products) => builder(order, products),
        );
      },
    );
  }
}

String _itemLabel(
  BuildContext context,
  OrderItem item,
  Map<String, Product> products,
) {
  final product = products[item.productId];
  final name = item.displayName(
    Localizations.localeOf(context).languageCode,
    product,
  );
  final variant = item.variantLabel(product);
  return variant == null ? name : '$name — $variant';
}

class _SuccessMessage extends StatelessWidget {
  const _SuccessMessage(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: AppCard(
      child: Row(
        children: [
          Icon(Icons.check_circle_outline, color: context.colors.success),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(message)),
        ],
      ),
    ),
  );
}
