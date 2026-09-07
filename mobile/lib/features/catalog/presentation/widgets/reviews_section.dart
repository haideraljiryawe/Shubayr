import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../data/review.dart';
import '../providers/catalog_providers.dart';

/// Read-only reviews for a product: an average-rating summary and the first
/// page of published reviews. The API exposes no reviewer name, so a review
/// shows its stars, a verified-purchase mark, the date and the comment.
class ReviewsSection extends ConsumerWidget {
  const ReviewsSection({
    super.key,
    required this.productId,
    required this.ratingAvg,
  });

  final String productId;
  final num ratingAvg;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final reviews = ref.watch(productReviewsProvider(productId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.productReviews, style: context.text.titleSmall),
        const SizedBox(height: AppSpacing.sm),
        reviews.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          ),
          error: (_, _) => _InlineError(
            onRetry: () => ref.invalidate(productReviewsProvider(productId)),
          ),
          data: (page) {
            if (page.data.isEmpty) {
              return Text(
                l10n.productNoReviews,
                style: context.text.bodyMedium?.copyWith(
                  color: context.colors.textMuted,
                ),
              );
            }
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Summary(ratingAvg: ratingAvg, total: page.total),
                const SizedBox(height: AppSpacing.md),
                for (var i = 0; i < page.data.length; i++) ...[
                  if (i > 0) const Divider(height: AppSpacing.lg),
                  _ReviewTile(review: page.data[i]),
                ],
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.ratingAvg, required this.total});

  final num ratingAvg;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(ratingAvg.toStringAsFixed(1), style: context.text.headlineSmall),
        const SizedBox(width: AppSpacing.sm),
        _Stars(rating: ratingAvg.round(), size: 18),
        const SizedBox(width: AppSpacing.sm),
        Text(
          context.l10n.productReviewsCount('$total'),
          style: context.text.bodySmall?.copyWith(
            color: context.colors.textSecondary,
          ),
        ),
      ],
    );
  }
}

class _ReviewTile extends StatelessWidget {
  const _ReviewTile({required this.review});

  final Review review;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    // Numeric date: locale-agnostic and Western-Arabic, like the rest of the app.
    final date = DateFormat('yyyy/MM/dd').format(review.createdAt);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            _Stars(rating: review.rating, size: 16),
            const Spacer(),
            Text(
              date,
              style: context.text.labelSmall?.copyWith(color: colors.textMuted),
            ),
          ],
        ),
        if (review.verifiedPurchase) ...[
          const SizedBox(height: AppSpacing.xs),
          _VerifiedBadge(),
        ],
        if (review.comment != null && review.comment!.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            review.comment!,
            style: context.text.bodyMedium?.copyWith(
              color: colors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}

class _VerifiedBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.verified_outlined, size: 14, color: colors.success),
        const SizedBox(width: 2),
        Text(
          context.l10n.productVerifiedPurchase,
          style: context.text.labelSmall?.copyWith(
            color: colors.success,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Five stars, filled up to [rating].
class _Stars extends StatelessWidget {
  const _Stars({required this.rating, this.size = 16});

  final int rating;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Icon(
            i <= rating ? Icons.star_rounded : Icons.star_outline_rounded,
            size: size,
            color: i <= rating ? colors.accent : colors.textMuted,
          ),
      ],
    );
  }
}

class _InlineError extends StatelessWidget {
  const _InlineError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(
          context.l10n.stateErrorTitle,
          style: context.text.bodyMedium?.copyWith(
            color: context.colors.textMuted,
          ),
        ),
        const Spacer(),
        TextButton(
          onPressed: onRetry,
          child: Text(context.l10n.actionRetry),
        ),
      ],
    );
  }
}
