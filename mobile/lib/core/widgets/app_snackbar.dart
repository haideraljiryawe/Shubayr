import 'dart:async';

import 'package:flutter/material.dart';

/// Shows a snackbar the app-standard way: it slides up from the bottom, sits for
/// its [SnackBar.duration] (3 seconds via [showAppSnackBarMessage]), then slides
/// away on its own, and can be swiped down to dismiss. One place so every prompt
/// behaves identically.
///
/// Route snackbars through this (or [showAppSnackBarMessage]) rather than calling
/// `ScaffoldMessenger` directly. Note: never call `hideCurrentSnackBar()` right
/// before showing — it cancels the new one's slide-in and it never appears. Pass
/// a fully-built [snackBar] for custom styling.
void showAppSnackBar(BuildContext context, SnackBar snackBar) {
  final controller = ScaffoldMessenger.of(context).showSnackBar(snackBar);
  // The framework's own auto-dismiss timer can stall in some environments (seen
  // on the iOS simulator), so close it ourselves after its duration — animated
  // (it slides out), and a no-op if it already went away.
  Timer(snackBar.duration + const Duration(milliseconds: 250), () {
    try {
      controller.close();
    } catch (_) {
      // The messenger may already be gone (e.g. the screen was popped).
    }
  });
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
