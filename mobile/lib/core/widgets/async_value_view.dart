import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'state_views.dart';

/// Renders an [AsyncValue] with the app's standard loading/error states.
///
/// Screens use this so every feature gets identical behaviour regardless of
/// whether the data came from a mock or a remote repository.
class AsyncValueView<T> extends StatelessWidget {
  const AsyncValueView({
    super.key,
    required this.value,
    required this.builder,
    this.loading,
    this.onRetry,
  });

  final AsyncValue<T> value;
  final Widget Function(BuildContext context, T data) builder;

  /// Optional skeleton to show instead of the default spinner.
  final Widget? loading;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => value.when(
    skipLoadingOnRefresh: true,
    data: (data) => builder(context, data),
    loading: () => loading ?? const AppLoadingView(),
    error: (error, _) => AppErrorView(error: error, onRetry: onRetry),
  );
}
