import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/tokens/app_spacing.dart';

/// Scroll clearance supplied only by the customer shell's floating navigation.
/// Keeping it scoped avoids changing layouts that reuse screens outside it.
class BottomNavigationInset extends InheritedWidget {
  const BottomNavigationInset({
    super.key,
    required this.bottom,
    required super.child,
  });

  final double bottom;

  static double of(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<BottomNavigationInset>()
          ?.bottom ??
      0;

  @override
  bool updateShouldNotify(BottomNavigationInset oldWidget) =>
      bottom != oldWidget.bottom;
}

/// Shared content sizing. Only compact spacing/columns and the retained wide
/// header need window thresholds; page content otherwise follows its slot.
abstract final class AppLayout {
  static const compactWidth = 600.0;
  static const wideHeaderWidth = 900.0;

  static bool usesWideHeader(BuildContext context) =>
      MediaQuery.sizeOf(context).width >= wideHeaderWidth;

  static double pageHorizontal(BuildContext context) =>
      MediaQuery.sizeOf(context).width < compactWidth
      ? AppSpacing.screenMobileH
      : AppSpacing.screenH;

  static EdgeInsetsDirectional pageInsets(
    BuildContext context, {
    double top = AppSpacing.screenH,
    double bottom = AppSpacing.screenH,
  }) => EdgeInsetsDirectional.fromSTEB(
    pageHorizontal(context),
    top,
    pageHorizontal(context),
    bottom,
  );

  /// Clearance is inside the scroll view, never a fixed footer around it.
  static EdgeInsetsDirectional scrollInsets(BuildContext context) => pageInsets(
    context,
    bottom: AppSpacing.screenH + BottomNavigationInset.of(context),
  );

  static const productFilterWidth = 520.0;
  static const dateRangeWidth = 520.0;
  static const dateRangeHeight = 640.0;
  static const categoryShortcutWidth = 96.0;
  static const categoryCardHeight = 100.0;

  /// Main category artwork's share of the available card width.
  static const categoryCardImageFraction = 0.42;
  static const subcategoryMinWidth = 150.0;
  static const categoryIconSize = 32.0;
  static const categoryIconTarget = 56.0;

  /// One artwork proportion on all windows, within a readable content width.
  static const homeBannerAspectRatio = 2.0;

  /// Two compact cards and a glimpse of the next on phones; cap each card
  /// on wide screens and allow readable growth with accessibility text sizes.
  static double homeOfferCardWidth(
    BuildContext context,
    double availableWidth,
  ) => math.min(availableWidth * 0.44, productMinWidth) * textScale(context);

  static const authWidth = 420.0;
  static const readingWidth = 760.0;
  static const formWidth = 1200.0;
  static const detailWidth = 1440.0;
  static const productMinWidth = 200.0;
  static const cardMinWidth = 280.0;
  static const orderMinWidth = 360.0;
  static const fieldMinWidth = 260.0;
  static const dashboardMinHeight = 120.0;
  static const dashboardMinWidth = 220.0;

  static double textScale(BuildContext context) =>
      math.max(1, MediaQuery.textScalerOf(context).scale(14) / 14);

  /// Preserve compact layouts; wider slots fit as many readable items as
  /// their minimum width and current text scale allow.
  static int columns(
    BuildContext context,
    double availableWidth, {
    double minItemWidth = cardMinWidth,
    int phoneColumns = 1,
    double spacing = AppSpacing.md,
  }) {
    if (availableWidth < compactWidth) {
      return phoneColumns;
    }
    return math.max(
      1,
      ((availableWidth + spacing) /
              (minItemWidth * textScale(context) + spacing))
          .floor(),
    );
  }
}

/// Opt-in width constraint for a form/detail/reading region, not for list pages.
class ResponsiveContent extends StatelessWidget {
  const ResponsiveContent({
    super.key,
    required this.child,
    this.maxWidth = AppLayout.readingWidth,
    this.alignment = Alignment.topCenter,
  });
  final Widget child;
  final double maxWidth;
  final AlignmentGeometry alignment;
  @override
  Widget build(BuildContext context) => Align(
    alignment: alignment,
    heightFactor: 1,
    child: ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: child,
    ),
  );
}

/// Stable Wrap children preserve field controllers, focus and validation while
/// the window changes width. Large editors can explicitly occupy a full row.
class ResponsiveField extends StatelessWidget {
  const ResponsiveField({
    super.key,
    required this.child,
    this.fullWidth = false,
  });
  final Widget child;
  final bool fullWidth;
  @override
  Widget build(BuildContext context) => child;
}

class ResponsiveFields extends StatelessWidget {
  const ResponsiveFields({
    super.key,
    required this.children,
    this.minItemWidth = AppLayout.fieldMinWidth,
  });
  final List<Widget> children;
  final double minItemWidth;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, constraints) {
      final columns = AppLayout.columns(
        context,
        constraints.maxWidth,
        minItemWidth: minItemWidth,
      );
      final width =
          (constraints.maxWidth - (columns - 1) * AppSpacing.md) / columns;
      return Wrap(
        spacing: AppSpacing.md,
        runSpacing: AppSpacing.md,
        children: [
          for (var i = 0; i < children.length; i++)
            SizedBox(
              key: ValueKey<Object>(children[i].key ?? i),
              width:
                  children[i] is ResponsiveField &&
                      (children[i] as ResponsiveField).fullWidth
                  ? constraints.maxWidth
                  : width,
              child: children[i],
            ),
        ],
      );
    },
  );
}

/// Lazy rows with natural content height (no aspect-ratio clipping for text).
/// Intrinsic sizing is opt-in for catalog tiles with a flexible price footer.
class ResponsiveCardSliver extends StatefulWidget {
  const ResponsiveCardSliver({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.itemKeyBuilder,
    this.minItemWidth = AppLayout.cardMinWidth,
    this.phoneColumns = 1,
    this.equalHeight = false,
  });
  final int itemCount, phoneColumns;
  final IndexedWidgetBuilder itemBuilder;

  /// Unique entity identity for mutable lists; omit only for static content.
  final Object Function(int index)? itemKeyBuilder;
  final double minItemWidth;
  final bool equalHeight;
  @override
  State<ResponsiveCardSliver> createState() => _ResponsiveCardSliverState();
}

class _ResponsiveCardSliverState extends State<ResponsiveCardSliver> {
  // Rows change parents when column counts change. Preserve mounted card state
  // (including a delivery confirmation dialog) across that regrouping.
  final _itemKeys = <Object, GlobalKey>{};

  Object _identity(int index) => widget.itemKeyBuilder?.call(index) ?? index;
  @override
  void didUpdateWidget(ResponsiveCardSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    final identities = {
      for (var i = 0; i < widget.itemCount; i++) _identity(i),
    };
    assert(
      identities.length == widget.itemCount,
      'Card identities must be unique',
    );
    _itemKeys.removeWhere((identity, _) => !identities.contains(identity));
  }

  @override
  Widget build(BuildContext context) => SliverLayoutBuilder(
    builder: (context, constraints) {
      final columns = AppLayout.columns(
        context,
        constraints.crossAxisExtent,
        minItemWidth: widget.minItemWidth,
        phoneColumns: widget.phoneColumns,
      );
      return SliverList.separated(
        itemCount: (widget.itemCount + columns - 1) ~/ columns,
        separatorBuilder: (_, _) => const SizedBox(height: AppSpacing.md),
        itemBuilder: (context, row) {
          final content = Row(
            crossAxisAlignment: widget.equalHeight
                ? CrossAxisAlignment.stretch
                : CrossAxisAlignment.start,
            children: [
              for (var col = 0; col < columns; col++) ...[
                if (col > 0) const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: row * columns + col < widget.itemCount
                      ? KeyedSubtree(
                          key: _itemKeys.putIfAbsent(
                            _identity(row * columns + col),
                            GlobalKey.new,
                          ),
                          child: widget.itemBuilder(
                            context,
                            row * columns + col,
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
              ],
            ],
          );
          return widget.equalHeight ? IntrinsicHeight(child: content) : content;
        },
      );
    },
  );
}

class ResponsiveCardList extends StatelessWidget {
  const ResponsiveCardList({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.itemKeyBuilder,
    this.padding,
    this.physics,
    this.controller,
    this.minItemWidth = AppLayout.cardMinWidth,
    this.phoneColumns = 1,
    this.footer,
    this.equalHeight = false,
  });
  final int itemCount, phoneColumns;
  final IndexedWidgetBuilder itemBuilder;

  /// Unique entity identity for mutable lists; omit only for static content.
  final Object Function(int index)? itemKeyBuilder;
  final EdgeInsetsGeometry? padding;
  final ScrollPhysics? physics;
  final ScrollController? controller;
  final double minItemWidth;
  final Widget? footer;
  final bool equalHeight;
  @override
  Widget build(BuildContext context) => CustomScrollView(
    controller: controller,
    physics: physics,
    slivers: [
      SliverPadding(
        padding: padding ?? AppLayout.pageInsets(context),
        sliver: SliverMainAxisGroup(
          slivers: [
            ResponsiveCardSliver(
              itemCount: itemCount,
              itemBuilder: itemBuilder,
              itemKeyBuilder: itemKeyBuilder,
              minItemWidth: minItemWidth,
              phoneColumns: phoneColumns,
              equalHeight: equalHeight,
            ),
            if (footer != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: footer,
                ),
              ),
          ],
        ),
      ),
    ],
  );
}

/// Scrollable detail areas: stacked on small slots, adjacent on wider ones.
/// Wrap keeps the same element ancestry across resizing (forms/gallery state).
class ResponsiveSections extends StatelessWidget {
  const ResponsiveSections({
    super.key,
    required this.children,
    this.minItemWidth = AppLayout.orderMinWidth,
    this.maxWidth = AppLayout.detailWidth,
    this.stackedSpacing = AppSpacing.lg,
  });
  final List<Widget> children;
  final double minItemWidth, maxWidth, stackedSpacing;
  @override
  Widget build(BuildContext context) => ResponsiveContent(
    maxWidth: maxWidth,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final columns = AppLayout.columns(
          context,
          constraints.maxWidth,
          minItemWidth: minItemWidth,
          spacing: AppSpacing.lg,
        ).clamp(1, math.max(1, children.length));
        final width =
            (constraints.maxWidth - AppSpacing.lg * (columns - 1)) / columns;
        return Wrap(
          spacing: AppSpacing.lg,
          runSpacing: stackedSpacing,
          children: [
            for (var i = 0; i < children.length; i++)
              SizedBox(
                key: ValueKey<Object>(children[i].key ?? i),
                width: width,
                child: children[i],
              ),
          ],
        );
      },
    ),
  );
}

/// Keep a label and value on opposite edges when they fit; wrap a long value
/// below the label at narrow widths or larger text sizes without truncating it.
class ResponsiveValueRow extends StatelessWidget {
  const ResponsiveValueRow({
    super.key,
    required this.label,
    required this.value,
  });
  final Widget label, value;
  @override
  Widget build(BuildContext context) => SizedBox(
    width: double.infinity,
    child: Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: [label, value],
    ),
  );
}
