import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/tokens/app_spacing.dart';

/// Logical pixels. Window classes describe space, not fixed column counts.
enum AppWindowClass { mobile, tablet, compactDesktop, desktop, largeDesktop }

abstract final class AppBreakpoints {
  static const tablet = 600.0;
  static const compactDesktop = 900.0;
  static const desktop = 1200.0;
  static const largeDesktop = 1536.0;
  static AppWindowClass classify(double width) => switch (width) {
    < tablet => AppWindowClass.mobile,
    < compactDesktop => AppWindowClass.tablet,
    < desktop => AppWindowClass.compactDesktop,
    < largeDesktop => AppWindowClass.desktop,
    _ => AppWindowClass.largeDesktop,
  };
}

/// Content-specific sizes; never a global cap on the application or tables.
abstract final class AppLayout {
  /// Wide phone artwork gradually becomes a panoramic desktop banner.
  /// Interpolation avoids a height jump on either side of a breakpoint.
  static double homeBannerAspectRatio(double imageWidth) {
    final progress =
        ((imageWidth - AppBreakpoints.tablet) /
                (AppBreakpoints.desktop - AppBreakpoints.tablet))
            .clamp(0.0, 1.0);
    return 2.0 + (4.0 - 2.0) * progress;
  }

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
  static const summaryWidth = 360.0;
  static const categoryRailWidth = 180.0;

  static double textScale(BuildContext context) =>
      math.max(1, MediaQuery.textScalerOf(context).scale(14) / 14);

  /// Use the smaller of the viewport and local slot so nested panes retain
  /// phone behavior when a rail or split view leaves little room.
  static int columns(
    BuildContext context,
    double availableWidth, {
    double minItemWidth = cardMinWidth,
    int phoneColumns = 1,
    double spacing = AppSpacing.md,
  }) {
    if (math.min(MediaQuery.sizeOf(context).width, availableWidth) <
        AppBreakpoints.tablet) {
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
  });
  final Widget child;
  final double maxWidth;
  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.topCenter,
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
    this.minItemWidth = AppLayout.cardMinWidth,
    this.phoneColumns = 1,
    this.equalHeight = false,
  });
  final int itemCount, phoneColumns;
  final IndexedWidgetBuilder itemBuilder;
  final double minItemWidth;
  final bool equalHeight;
  @override
  State<ResponsiveCardSliver> createState() => _ResponsiveCardSliverState();
}

class _ResponsiveCardSliverState extends State<ResponsiveCardSliver> {
  // Rows change parents when column counts change. Preserve mounted card state
  // (including a delivery confirmation dialog) across that regrouping.
  final _itemKeys = <int, GlobalKey>{};
  @override
  void didUpdateWidget(ResponsiveCardSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    _itemKeys.removeWhere((index, _) => index >= widget.itemCount);
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
                            row * columns + col,
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
    this.padding = const EdgeInsets.all(AppSpacing.screenH),
    this.physics,
    this.controller,
    this.minItemWidth = AppLayout.cardMinWidth,
    this.phoneColumns = 1,
    this.footer,
    this.equalHeight = false,
  });
  final int itemCount, phoneColumns;
  final IndexedWidgetBuilder itemBuilder;
  final EdgeInsetsGeometry padding;
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
        padding: padding,
        sliver: SliverMainAxisGroup(
          slivers: [
            ResponsiveCardSliver(
              itemCount: itemCount,
              itemBuilder: itemBuilder,
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
    this.breakpoint = AppBreakpoints.compactDesktop,
    this.maxWidth = AppLayout.detailWidth,
    this.stackedSpacing = AppSpacing.lg,
  });
  final List<Widget> children;
  final double breakpoint, maxWidth, stackedSpacing;
  @override
  Widget build(BuildContext context) => ResponsiveContent(
    maxWidth: maxWidth,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final wide =
            constraints.maxWidth >= breakpoint * AppLayout.textScale(context);
        final width = wide
            ? (constraints.maxWidth - AppSpacing.lg * (children.length - 1)) /
                  children.length
            : constraints.maxWidth;
        return Wrap(
          spacing: AppSpacing.lg,
          runSpacing: stackedSpacing,
          children: [
            for (var i = 0; i < children.length; i++)
              SizedBox(key: ValueKey(i), width: width, child: children[i]),
          ],
        );
      },
    ),
  );
}

/// Keep the existing bottom summary on smaller layouts; use a bounded adjacent
/// summary at desktop width. The main scrollable keeps its element on resize.
class ResponsiveBodyWithAside extends StatelessWidget {
  const ResponsiveBodyWithAside({
    super.key,
    required this.body,
    required this.aside,
  });
  final Widget body, aside;
  @override
  Widget build(BuildContext context) => ResponsiveContent(
    maxWidth: AppLayout.detailWidth,
    child: LayoutBuilder(
      builder: (context, constraints) {
        final wide =
            constraints.maxWidth >=
            AppBreakpoints.desktop * AppLayout.textScale(context);
        return Flex(
          direction: wide ? Axis.horizontal : Axis.vertical,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(key: const ValueKey('body'), child: body),
            SizedBox(
              key: const ValueKey('aside'),
              width: wide ? AppLayout.summaryWidth : null,
              child: wide ? SingleChildScrollView(child: aside) : aside,
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
