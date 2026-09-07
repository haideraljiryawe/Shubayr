import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

import '../theme/tokens/app_motion.dart';

/// One queue per navigator overlay, matching ScaffoldMessenger's one-at-a-time
/// behaviour without inheriting Material 3's expand/fade snackbar transition.
final _snackBarQueues = Expando<_AppSnackBarQueue>();

/// Shows an app snackbar with an actual bottom-to-top slide transition.
///
/// Flutter's Material 3 floating snackbar uses a height/fade transition rather
/// than a vertical slide. Keeping the transition here makes every app snackbar
/// enter from below, remain visible for [SnackBar.duration], and slide back down.
void showAppSnackBar(BuildContext context, SnackBar snackBar) {
  final overlay = Overlay.maybeOf(context);
  if (overlay == null) {
    // Defensive fallback for unusual contexts without a Navigator. Normal app
    // routes always use the overlay path above.
    ScaffoldMessenger.of(context).showSnackBar(
      snackBar,
      snackBarAnimationStyle: const AnimationStyle(
        duration: AppMotion.medium,
        reverseDuration: AppMotion.medium,
      ),
    );
    return;
  }

  (_snackBarQueues[overlay] ??= _AppSnackBarQueue(overlay)).show(snackBar);
}

/// A plain text prompt with an optional action, shown [showAppSnackBar]-style.
void showAppSnackBarMessage(
  BuildContext context, {
  required String message,
  String? actionLabel,
  VoidCallback? onAction,
}) => showAppSnackBar(
  context,
  SnackBar(
    content: Text(message),
    duration: const Duration(seconds: 3),
    action: actionLabel == null
        ? null
        : SnackBarAction(label: actionLabel, onPressed: onAction ?? () {}),
  ),
);

class _AppSnackBarQueue {
  _AppSnackBarQueue(this.overlay);

  final OverlayState overlay;
  final Queue<SnackBar> _pending = Queue<SnackBar>();
  OverlayEntry? _active;

  void show(SnackBar snackBar) {
    _pending.addLast(snackBar);
    _showNext();
  }

  void _showNext() {
    if (_active != null || _pending.isEmpty || !overlay.mounted) return;

    final snackBar = _pending.removeFirst();
    late final OverlayEntry entry;
    entry = OverlayEntry(
      builder: (context) =>
          _SlidingSnackBar(snackBar: snackBar, onClosed: (_) => _remove(entry)),
    );
    _active = entry;
    overlay.insert(entry);
  }

  void _remove(OverlayEntry entry) {
    if (!identical(_active, entry)) return;
    entry
      ..remove()
      ..dispose();
    _active = null;
    _showNext();
  }
}

class _SlidingSnackBar extends StatefulWidget {
  const _SlidingSnackBar({required this.snackBar, required this.onClosed});

  final SnackBar snackBar;
  final ValueChanged<SnackBarClosedReason> onClosed;

  @override
  State<_SlidingSnackBar> createState() => _SlidingSnackBarState();
}

class _SlidingSnackBarState extends State<_SlidingSnackBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<Offset> _position;
  final _dismissibleKey = UniqueKey();
  Timer? _timer;
  bool _closing = false;
  bool _actionPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: AppMotion.medium,
      reverseDuration: AppMotion.medium,
    );
    _position = Tween<Offset>(begin: const Offset(0, 1), end: Offset.zero)
        .animate(
          CurvedAnimation(
            parent: _controller,
            curve: AppMotion.standard,
            reverseCurve: Curves.easeInCubic,
          ),
        );

    WidgetsBinding.instance.addPostFrameCallback((_) => _show());
  }

  Future<void> _show() async {
    if (!mounted) return;
    final reduceMotion = MediaQuery.accessibleNavigationOf(context);
    if (reduceMotion) {
      _controller.value = 1;
    } else {
      await _controller.forward();
    }
    if (!mounted || _closing) return;
    widget.snackBar.onVisible?.call();
    _timer = Timer(widget.snackBar.duration, _dismiss);
  }

  Future<void> _dismiss({
    SnackBarClosedReason reason = SnackBarClosedReason.timeout,
  }) async {
    if (_closing || !mounted) return;
    _closing = true;
    _timer?.cancel();

    if (!MediaQuery.accessibleNavigationOf(context)) {
      await _controller.reverse();
      if (!mounted) return;
    }
    widget.onClosed(reason);
  }

  void _dismissImmediately() {
    if (_closing) return;
    _closing = true;
    _timer?.cancel();
    widget.onClosed(SnackBarClosedReason.swipe);
  }

  void _runAction() {
    if (_actionPressed) return;
    _actionPressed = true;
    widget.snackBar.action!.onPressed();
    _dismiss(reason: SnackBarClosedReason.action);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final snackBar = widget.snackBar;
    final snackTheme = SnackBarTheme.of(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    final dismissDirection =
        snackBar.dismissDirection ??
        snackTheme.dismissDirection ??
        DismissDirection.down;
    final action = snackBar.action;
    final showCloseIcon =
        snackBar.showCloseIcon ?? snackTheme.showCloseIcon ?? false;
    final closeIconColor = snackBar.closeIconColor ?? snackTheme.closeIconColor;

    Widget content = snackBar.content;
    if (showCloseIcon) {
      content = Row(
        children: [
          Expanded(child: content),
          IconButton(
            onPressed: () => _dismiss(reason: SnackBarClosedReason.dismiss),
            color: closeIconColor,
            icon: const Icon(Icons.close),
            tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
          ),
        ],
      );
    }

    // Let Flutter render the standard SnackBar surface and layout at their
    // fully-visible state. Only the surrounding transition is replaced.
    Widget surface = SnackBar(
      key: snackBar.key,
      content: content,
      backgroundColor: snackBar.backgroundColor,
      elevation: snackBar.elevation,
      margin: snackBar.margin,
      padding: snackBar.padding,
      width: snackBar.width,
      shape: snackBar.shape,
      hitTestBehavior: snackBar.hitTestBehavior,
      behavior: snackBar.behavior,
      action: action == null
          ? null
          : SnackBarAction(
              textColor: action.textColor,
              disabledTextColor: action.disabledTextColor,
              backgroundColor: action.backgroundColor,
              disabledBackgroundColor: action.disabledBackgroundColor,
              label: action.label,
              onPressed: _runAction,
            ),
      actionOverflowThreshold: snackBar.actionOverflowThreshold,
      showCloseIcon: false,
      duration: snackBar.duration,
      persist: false,
      animation: const AlwaysStoppedAnimation(1),
      dismissDirection: DismissDirection.none,
      clipBehavior: snackBar.clipBehavior,
    );

    surface = Dismissible(
      key: _dismissibleKey,
      direction: dismissDirection,
      resizeDuration: null,
      onDismissed: (_) => _dismissImmediately(),
      child: surface,
    );

    return Positioned.fill(
      bottom: bottomInset,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: Semantics(
          container: true,
          liveRegion: true,
          onDismiss: () => _dismiss(reason: SnackBarClosedReason.dismiss),
          child: SlideTransition(
            key: const ValueKey('app-snackbar-slide'),
            position: _position,
            child: SafeArea(top: false, child: surface),
          ),
        ),
      ),
    );
  }
}
