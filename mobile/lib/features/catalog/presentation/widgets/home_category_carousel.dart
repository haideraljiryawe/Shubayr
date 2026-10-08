import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/rendering.dart' show ScrollCacheExtent;

import '../../../../core/layout/app_layout.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../data/category.dart';
import 'category_icon.dart';

/// A time-driven, lazily built ring. Native scrolling and InkWell own gestures.
class HomeCategoryCarousel extends StatefulWidget {
  const HomeCategoryCarousel({
    super.key,
    required this.categories,
    required this.onSelected,
    this.claimStartupDelay,
  });

  final List<Category> categories;
  final ValueChanged<Category> onSelected;

  /// Claims the one-time app startup wait after the categories are visible.
  final bool Function()? claimStartupDelay;

  @override
  State<HomeCategoryCarousel> createState() => _HomeCategoryCarouselState();
}

class _HomeCategoryCarouselState extends State<HomeCategoryCarousel>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  static const _speed = 12.0;
  static const _startupDelay = Duration(seconds: 1);
  static const _resumeDelay = Duration(seconds: 3);
  static const _center = ValueKey('category-ring-center');

  late final Ticker _ticker;
  ScrollController _controller = ScrollController(keepScrollOffset: false);
  ScrollPosition? _verticalPosition;
  ScrollableState? _verticalScrollable;
  Timer? _delayTimer;
  Duration _delay = Duration.zero;
  Duration _lastTick = Duration.zero;
  final Set<int> _pointers = {};
  List<String> _ids = const [];
  double _extent = 0;
  int _generation = 0;
  bool _loop = false;
  bool _visible = false;
  bool _enabled = false;
  bool _pageActive = false;
  bool _resumed = true;
  bool _scrolling = false;
  bool _programmatic = false;
  bool _startupChecked = false;
  bool _visibilityScheduled = false;

  double get _period => _extent * _ids.length;
  bool get _canMove =>
      _loop &&
      _visible &&
      _enabled &&
      _resumed &&
      _pointers.isEmpty &&
      !_scrolling &&
      _controller.hasClients;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_tick);
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _resumed = lifecycle == null || lifecycle == AppLifecycleState.resumed;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _pageActive =
        TickerMode.valuesOf(context).enabled &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    _enabled =
        _pageActive &&
        !MediaQuery.disableAnimationsOf(context) &&
        !MediaQuery.accessibleNavigationOf(context);
    final scrollable = Scrollable.maybeOf(context, axis: Axis.vertical);
    if (_verticalPosition != scrollable?.position) {
      _verticalPosition?.removeListener(_scheduleVisibility);
      _verticalScrollable = scrollable;
      _verticalPosition = scrollable?.position;
      _verticalPosition?.addListener(_scheduleVisibility);
    }
    _syncMotion();
    _scheduleVisibility();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    _syncMotion();
  }

  @override
  void didChangeMetrics() => _scheduleVisibility();

  void _scheduleVisibility() {
    if (_visibilityScheduled) return;
    _visibilityScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _visibilityScheduled = false;
      if (!mounted) return;
      final box = context.findRenderObject();
      if (box is! RenderBox || !box.hasSize) return;
      var viewport = Offset.zero & MediaQuery.sizeOf(context);
      final parent = _verticalScrollable?.context.findRenderObject();
      if (parent is RenderBox && parent.hasSize) {
        viewport = viewport.intersect(
          parent.localToGlobal(Offset.zero) & parent.size,
        );
      }
      final bounds = box.localToGlobal(Offset.zero) & box.size;
      _visible = !bounds.isEmpty && bounds.overlaps(viewport);
      _syncMotion();
    });
  }

  void _stopTicker() {
    _ticker.stop();
    _lastTick = Duration.zero;
  }

  void _syncMotion() {
    if (!_startupChecked &&
        _visible &&
        _pageActive &&
        _resumed &&
        _ids.isNotEmpty) {
      _startupChecked = true;
      final firstDisplay = widget.claimStartupDelay?.call() ?? false;
      if (firstDisplay && _delay == Duration.zero) _delay = _startupDelay;
    }
    if (!_canMove) {
      _stopTicker();
      _delayTimer?.cancel();
      _delayTimer = null;
      // A hidden/disabled first display consumes the startup wait. Returning
      // must not restart it; the interaction delay retains its existing rules.
      if (_delay == _startupDelay) _delay = Duration.zero;
    } else if (_delay != Duration.zero) {
      _stopTicker();
      _delayTimer ??= Timer(_delay, () {
        _delayTimer = null;
        _delay = Duration.zero;
        if (mounted) _syncMotion();
      });
    } else if (!_ticker.isActive) {
      _lastTick = Duration.zero;
      _ticker.start();
    }
  }

  void _tick(Duration elapsed) {
    final seconds =
        (elapsed - _lastTick).inMicroseconds / Duration.microsecondsPerSecond;
    _lastTick = elapsed;
    if (!_canMove || seconds <= 0) return;
    // Increasing the logical offset moves content left in LTR and right in RTL.
    _jump((_controller.offset + _speed * seconds) % _period);
  }

  void _jump(double offset) {
    _programmatic = true;
    try {
      _controller.jumpTo(offset);
    } finally {
      _programmatic = false;
    }
  }

  void _interact() {
    _delay = _resumeDelay;
    _delayTimer?.cancel();
    _delayTimer = null;
    _stopTicker();
  }

  void _pointerEnd(PointerEvent event) {
    _pointers.remove(event.pointer);
    _syncMotion();
  }

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 || _programmatic) return false;
    if (notification is ScrollStartNotification) {
      _scrolling = true;
      _interact();
    } else if (notification is ScrollEndNotification) {
      _scrolling = false;
      final generation = _generation;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted ||
            generation != _generation ||
            _scrolling ||
            _pointers.isNotEmpty) {
          return;
        }
        // Never interrupt a drag or its ballistic activity. An exact whole-ring
        // translation after settling has identical pixels and bounds idle offsets.
        if (_loop && _controller.hasClients) {
          _jump(_controller.offset % _period);
        }
        _syncMotion();
      });
    }
    return false;
  }

  void _configure(double extent, bool loop) {
    final ids = widget.categories.map((c) => c.id).toList();
    if (extent == _extent && loop == _loop && listEquals(ids, _ids)) return;
    var offset = 0.0;
    if (_controller.hasClients &&
        _extent > 0 &&
        _ids.isNotEmpty &&
        ids.isNotEmpty) {
      final item = _controller.offset / _extent;
      final index = item.floor();
      final nextIndex = ids.indexOf(_ids[index % _ids.length]);
      if (nextIndex >= 0) offset = (nextIndex + item - index) * extent;
    }
    _stopTicker();
    final old = _controller;
    _controller = ScrollController(
      initialScrollOffset: loop ? offset : 0,
      keepScrollOffset: false,
    );
    _ids = ids;
    _extent = extent;
    _loop = loop;
    _scrolling = false;
    _generation++;
    // The replacement starts at the same category/fraction on its first layout.
    // The old Scrollable must detach before its controller is disposed.
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    _scheduleVisibility();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _verticalPosition?.removeListener(_scheduleVisibility);
    _delayTimer?.cancel();
    _ticker.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final width =
        AppLayout.categoryShortcutWidth * AppLayout.textScale(context);
    final padding = AppLayout.pageInsets(context, top: 0, bottom: 0);
    final language = Localizations.localeOf(context).languageCode;
    final accessible = MediaQuery.accessibleNavigationOf(context);
    Widget item(int index) {
      final category = widget.categories[index % widget.categories.length];
      return KeyedSubtree(
        key: ValueKey(index),
        child: _CategoryShortcut(
          key: ValueKey('home-category-${category.id}'),
          category: category,
          language: language,
          width: width,
          onTap: () => widget.onSelected(category),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final loop =
            !accessible &&
            widget.categories.length > 1 &&
            widget.categories.length * width >
                constraints.maxWidth - padding.horizontal;
        _configure(width, loop);
        _scheduleVisibility();
        if (widget.categories.isEmpty) return const SizedBox.shrink();
        if (!loop) {
          // A single semantic copy for screen readers; small lists keep their
          // original layout and do not move merely to fill a wide screen.
          return SingleChildScrollView(
            key: const ValueKey('home-category-shortcuts'),
            scrollDirection: Axis.horizontal,
            padding: padding,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < widget.categories.length; i++) item(i),
              ],
            ),
          );
        }
        var labelHeight = 0.0;
        final painter = TextPainter(
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
          locale: Localizations.localeOf(context),
          maxLines: 2,
          ellipsis: '…',
        );
        for (final category in widget.categories) {
          painter.text = TextSpan(
            text: category.localizedName(language),
            style: context.text.labelMedium,
          );
          painter.layout(maxWidth: width - AppSpacing.sm * 2);
          labelHeight = math.max(labelHeight, painter.height);
        }
        painter.dispose();
        return SizedBox(
          key: const ValueKey('home-category-shortcuts'),
          height: AppLayout.categoryIconTarget + AppSpacing.sm + labelHeight,
          child: Padding(
            padding: padding,
            child: Listener(
              onPointerDown: (event) {
                _pointers.add(event.pointer);
                _interact();
              },
              onPointerUp: _pointerEnd,
              onPointerCancel: _pointerEnd,
              child: NotificationListener<ScrollNotification>(
                onNotification: _onScroll,
                child: ScrollConfiguration(
                  behavior: ScrollConfiguration.of(
                    context,
                  ).copyWith(scrollbars: false, overscroll: false),
                  child: CustomScrollView(
                    key: ValueKey(_generation),
                    controller: _controller,
                    scrollDirection: Axis.horizontal,
                    center: _center,
                    scrollCacheExtent: const ScrollCacheExtent.pixels(0),
                    slivers: [
                      SliverFixedExtentList(
                        itemExtent: width,
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => item(-index - 1),
                          addAutomaticKeepAlives: false,
                        ),
                      ),
                      SliverFixedExtentList(
                        key: _center,
                        itemExtent: width,
                        delegate: SliverChildBuilderDelegate(
                          (context, index) => item(index),
                          addAutomaticKeepAlives: false,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _CategoryShortcut extends StatelessWidget {
  const _CategoryShortcut({
    super.key,
    required this.category,
    required this.language,
    required this.width,
    required this.onTap,
  });

  final Category category;
  final String language;
  final double width;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: width,
    child: Material(
      type: MaterialType.transparency,
      child: InkWell(
        borderRadius: AppRadii.mdAll,
        onTap: onTap,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: AppLayout.categoryIconTarget,
              height: AppLayout.categoryIconTarget,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: context.colors.categoryShortcutBackground,
              ),
              child: Icon(
                categoryShortcutIconFor(
                  null,
                  categoryId: category.id,
                  iconKey: category.iconKey,
                ),
                size: AppLayout.categoryIconSize * 1.2,
                color: context.colors.primary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              child: Text(
                category.localizedName(language),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: context.text.labelMedium,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
