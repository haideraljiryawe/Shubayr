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

class ReviewOrderScreen extends ConsumerStatefulWidget {
  const ReviewOrderScreen({super.key, required this.orderId});
  final String orderId;
  @override
  ConsumerState<ReviewOrderScreen> createState() => _ReviewOrderScreenState();
}

class _ReviewOrderScreenState extends ConsumerState<ReviewOrderScreen> {
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
    final repository = ref.read(afterSalesRepositoryProvider);
    setState(() {
      _busy = true;
      _error = null;
      _sent = false;
    });
    try {
      final review = await repository.submitReview(
        productId: item.productId,
        orderItemId: item.id,
        rating: _rating,
        comment: _comment.text.trim().isEmpty ? null : _comment.text.trim(),
      );
      if (!mounted || ref.read(afterSalesRepositoryProvider) != repository) {
        return;
      }
      ref.read(afterSalesReceiptsProvider.notifier).addReview(review);
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
    final receipts = ref.watch(afterSalesReceiptsProvider);
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.reviewOrderTitle)),
        body: _AfterSalesOrderView(
          orderId: widget.orderId,
          builder: (order, products) {
            final available = order.items
                .where((i) => !receipts.reviewed(i.id))
                .toList();
            final selected = available
                .where((i) => i.id == _itemId)
                .firstOrNull;
            return ResponsiveContent(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenH),
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
                      key: ValueKey('review-item-${receipts.reviews.length}'),
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
    );
  }
}

class ReturnOrderScreen extends ConsumerStatefulWidget {
  const ReturnOrderScreen({super.key, required this.orderId});
  final String orderId;
  @override
  ConsumerState<ReturnOrderScreen> createState() => _ReturnOrderScreenState();
}

class _ReturnOrderScreenState extends ConsumerState<ReturnOrderScreen> {
  final _reason = TextEditingController();
  final Map<String, int> _quantities = {};
  bool _busy = false;
  ReturnRequest? _submitted;
  AppFailure? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_quantities.values.any((n) => n > 0)) return;
    final repository = ref.read(afterSalesRepositoryProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final request = await repository.requestReturn(
        orderId: widget.orderId,
        reason: _reason.text.trim().isEmpty ? null : _reason.text.trim(),
        items: [
          for (final entry in _quantities.entries)
            if (entry.value > 0)
              ReturnRequestItem(orderItemId: entry.key, quantity: entry.value),
        ],
      );
      if (!mounted || ref.read(afterSalesRepositoryProvider) != repository) {
        return;
      }
      ref.read(afterSalesReceiptsProvider.notifier).addReturn(request);
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
    final receipts = ref.watch(afterSalesReceiptsProvider);
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.returnOrderTitle)),
        body: _AfterSalesOrderView(
          orderId: widget.orderId,
          builder: (order, products) {
            final submitted = _submitted;
            if (submitted != null) {
              return ResponsiveContent(
                child: ListView(
                  padding: const EdgeInsets.all(AppSpacing.screenH),
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
                          l10n.orderLineQuantity('${line.quantity}'),
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
                .where((i) => i.quantity > receipts.returnedQuantity(i.id))
                .toList();
            return ResponsiveContent(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenH),
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
                              '${item.quantity - receipts.returnedQuantity(item.id)}',
                            ),
                          ),
                          Row(
                            children: [
                              IconButton(
                                tooltip: l10n.returnDecrease,
                                onPressed:
                                    _busy || (_quantities[item.id] ?? 0) == 0
                                    ? null
                                    : () => setState(
                                        () => _quantities[item.id] =
                                            _quantities[item.id]! - 1,
                                      ),
                                icon: const Icon(Icons.remove),
                              ),
                              Text('${_quantities[item.id] ?? 0}'),
                              IconButton(
                                tooltip: l10n.returnIncrease,
                                onPressed:
                                    _busy ||
                                        (_quantities[item.id] ?? 0) >=
                                            item.quantity -
                                                receipts.returnedQuantity(
                                                  item.id,
                                                )
                                    ? null
                                    : () => setState(
                                        () => _quantities[item.id] =
                                            (_quantities[item.id] ?? 0) + 1,
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
                      enabled: !_busy,
                      minLines: 3,
                      maxLines: 5,
                      decoration: InputDecoration(labelText: l10n.returnReason),
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
                      onPressed: !_busy && _quantities.values.any((n) => n > 0)
                          ? _submit
                          : null,
                    ),
                  ],
                ],
              ),
            );
          },
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
    const loading = Padding(
      padding: EdgeInsets.all(AppSpacing.screenH),
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
