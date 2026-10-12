import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/components/navigation_themes.dart';

typedef _BranchRequest = ({int from, int to, double direction});

/// One-shot intent from the bottom bar, not from redirects, Back or deep links.
class CustomerBranchTransitionController {
  _BranchRequest? _pending;

  void prepare({
    required int from,
    required int to,
    required double direction,
  }) {
    _pending = (from: from, to: to, direction: direction);
  }

  _BranchRequest? _take() {
    final request = _pending;
    _pending = null;
    return request;
  }
}

class CustomerBranchTransitionScope extends InheritedWidget {
  const CustomerBranchTransitionScope({
    super.key,
    required this.controller,
    required this.sessionIdentity,
    required super.child,
  });

  final CustomerBranchTransitionController controller;
  final Object sessionIdentity;

  @override
  bool updateShouldNotify(CustomerBranchTransitionScope oldWidget) =>
      controller != oldWidget.controller ||
      sessionIdentity != oldWidget.sessionIdentity;
}

/// Keeps every branch Navigator mounted once, just like the default container.
/// Only the active and outgoing branches are painted during a tab transition.
class CustomerBranchTransition extends StatefulWidget {
  const CustomerBranchTransition({
    super.key,
    required this.currentIndex,
    required this.children,
  });

  final int currentIndex;
  final List<Widget> children;

  static Widget containerBuilder(
    BuildContext context,
    StatefulNavigationShell shell,
    List<Widget> children,
  ) => CustomerBranchTransition(
    currentIndex: shell.currentIndex,
    children: children,
  );

  @override
  State<CustomerBranchTransition> createState() =>
      _CustomerBranchTransitionState();
}

class _CustomerBranchTransitionState extends State<CustomerBranchTransition>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: NavigationThemes.bottomPageTransitionDuration,
    value: 1,
  )..addStatusListener(_onStatus);
  late final Animation<double> _progress = _controller.drive(
    CurveTween(curve: NavigationThemes.bottomPageTransitionCurve),
  );
  CustomerBranchTransitionScope? _scope;
  TextDirection? _textDirection;
  bool _reduceMotion = false;
  int? _outgoing;
  double _direction = 1;

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed && _outgoing != null) {
      setState(() => _outgoing = null);
    }
  }

  void _settle() {
    _outgoing = null;
    _controller.stop();
    _controller.value = 1;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scope = context
        .dependOnInheritedWidgetOfExactType<CustomerBranchTransitionScope>()!;
    final media = MediaQuery.of(context);
    final direction = Directionality.of(context);
    _reduceMotion = media.disableAnimations || media.accessibleNavigation;
    if (_reduceMotion ||
        (_scope != null && _scope!.sessionIdentity != scope.sessionIdentity) ||
        (_textDirection != null && _textDirection != direction)) {
      scope.controller._take();
      _settle();
    }
    _scope = scope;
    _textDirection = direction;
  }

  @override
  void didUpdateWidget(CustomerBranchTransition oldWidget) {
    super.didUpdateWidget(oldWidget);
    final request = _scope?.controller._take();
    final changed = oldWidget.currentIndex != widget.currentIndex;
    if (changed &&
        !_reduceMotion &&
        request?.from == oldWidget.currentIndex &&
        request?.to == widget.currentIndex &&
        request!.direction != 0) {
      // Latest selection wins. Finish the previous visual transition before
      // replacing its outgoing branch; never queue animations or Navigators.
      _controller.stop();
      _outgoing = oldWidget.currentIndex;
      _direction = request.direction;
      _controller.forward(from: 0);
    } else if (changed || request != null) {
      _settle();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.currentIndex;
    final moving = _outgoing != null;
    // Paint the incoming branch last. Stable keys preserve every branch State
    // when the painting order changes, including nested Navigator histories.
    final order = [
      for (var i = 0; i < widget.children.length; i++)
        if (i != active) i,
      active,
    ];
    return ClipRect(
      child: Stack(
        fit: StackFit.expand,
        children: [
          for (final index in order)
            Offstage(
              key: ValueKey(index),
              offstage: index != active && index != _outgoing,
              child: IgnorePointer(
                ignoring: index != active,
                child: ExcludeSemantics(
                  excluding: index != active,
                  child: ExcludeFocus(
                    excluding: index != active,
                    child: SlideTransition(
                      key: ValueKey('bottom-page-slide-$index'),
                      position: moving
                          ? Tween<Offset>(
                              begin: index == active
                                  ? Offset(
                                      _direction *
                                          NavigationThemes
                                              .bottomPageIncomingOffset,
                                      0,
                                    )
                                  : Offset.zero,
                              end: index == _outgoing
                                  ? Offset(
                                      -_direction *
                                          NavigationThemes
                                              .bottomPageOutgoingOffset,
                                      0,
                                    )
                                  : Offset.zero,
                            ).animate(_progress)
                          : const AlwaysStoppedAnimation(Offset.zero),
                      child: FadeTransition(
                        opacity: moving && index == active
                            ? Tween<double>(
                                begin:
                                    NavigationThemes.bottomPageIncomingOpacity,
                                end: 1,
                              ).animate(_progress)
                            : const AlwaysStoppedAnimation(1),
                        child: TickerMode(
                          enabled: index == active,
                          child: RepaintBoundary(child: widget.children[index]),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
