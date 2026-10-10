import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/layout/app_layout.dart';
import '../../../../core/l10n/l10n_context.dart';
import '../../../../core/theme/theme_context.dart';
import '../../../../core/theme/tokens/app_radii.dart';
import '../../../../core/theme/tokens/app_motion.dart';
import '../../../../core/theme/tokens/app_spacing.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/async_value_view.dart';
import '../../../../core/widgets/skeleton.dart';
import '../../data/home_banner.dart';
import '../providers/banner_providers.dart';

class HomeBanners extends ConsumerWidget {
  const HomeBanners({super.key, this.onOpen});
  final Future<void> Function(Uri)? onOpen;

  Future<void> _open(BuildContext context, WidgetRef ref, Uri uri) async {
    var opened = false;
    try {
      opened = await ref.read(bannerLinkLauncherProvider)(uri);
    } catch (_) {
      // Platform launch failures use the same localized feedback as false.
    }
    if (!opened && context.mounted) {
      showAppSnackBarMessage(context, message: context.l10n.bannerOpenFailed);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) => AsyncValueView(
    value: ref.watch(homeBannersProvider),
    onRetry: () => ref.invalidate(homeBannersProvider),
    loading: const HomeBannerSkeleton(),
    builder: (_, banners) => banners.isEmpty
        ? const SizedBox.shrink()
        : Padding(
            padding: const EdgeInsets.only(top: AppSpacing.lg),
            child: HomeBannerDeck(
              banners: banners,
              onOpen: onOpen ?? (uri) => _open(context, ref, uri),
            ),
          ),
  );
}

/// Sentinel pages duplicate the last/first image. Once scrolling settles we
/// jump to its identical real page, keeping both directions visually continuous.
class HomeBannerDeck extends StatefulWidget {
  const HomeBannerDeck({super.key, required this.banners, this.onOpen});
  final List<HomeBanner> banners;
  final Future<void> Function(Uri)? onOpen;

  @override
  State<HomeBannerDeck> createState() => _HomeBannerDeckState();
}

class _HomeBannerDeckState extends State<HomeBannerDeck>
    with WidgetsBindingObserver {
  static const _interval = Duration(seconds: 5);
  late PageController _controller;
  Timer? _timer;
  int _page = 0;
  int _generation = 0;
  String? _selectedId;
  final _pointers = <int>{};
  bool _hovering = false;
  bool _focused = false;
  bool _enabled = true;
  bool _resumed = true;

  bool get _multiple => widget.banners.length > 1;
  int _index(int page) => _multiple ? (page - 1) % widget.banners.length : 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _resumed =
        WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
    _replaceController();
  }

  void _replaceController() {
    final index = widget.banners.indexWhere((b) => b.id == _selectedId);
    final selected = math.max(0, index);
    _selectedId = widget.banners.isEmpty ? null : widget.banners[selected].id;
    _page = _multiple ? selected + 1 : 0;
    _controller = PageController(
      initialPage: _page,
      keepPage: false,
      viewportFraction: 1.0,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _enabled =
        TickerMode.valuesOf(context).enabled &&
        (ModalRoute.of(context)?.isCurrent ?? true);
    _schedule();
  }

  @override
  void didUpdateWidget(HomeBannerDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldIds = oldWidget.banners.map((b) => b.id).join('\u0000');
    final newIds = widget.banners.map((b) => b.id).join('\u0000');
    if (oldIds != newIds) {
      _timer?.cancel();
      final previous = _controller;
      _generation++;
      _replaceController();
      // Dispose only after the old PageView detaches. Old scroll notifications
      // are ignored by generation, including a refresh during an animation.
      WidgetsBinding.instance.addPostFrameCallback((_) => previous.dispose());
    }
    _schedule();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    _schedule();
  }

  void _schedule() {
    _timer?.cancel();
    if (!mounted ||
        !_multiple ||
        !_enabled ||
        !_resumed ||
        _hovering ||
        _focused ||
        _pointers.isNotEmpty) {
      return;
    }
    if (_controller.hasClients &&
        _controller.position.isScrollingNotifier.value) {
      return;
    }
    _timer = Timer(_interval, () => _move(1));
  }

  void _move(int delta) {
    _timer?.cancel();
    if (!_multiple ||
        !_controller.hasClients ||
        _controller.position.isScrollingNotifier.value) {
      return;
    }
    _controller.animateToPage(
      _page + delta,
      duration: AppMotion.slow,
      curve: AppMotion.standard,
    );
  }

  void _settled(int generation) {
    // ScrollEnd is dispatched during layout. Recenter after the frame so a
    // listener never changes viewport layout while it is being laid out.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          generation != _generation ||
          !_controller.hasClients ||
          _controller.position.isScrollingNotifier.value) {
        return;
      }
      if (_multiple && (_page == 0 || _page == widget.banners.length + 1)) {
        _page = _page == 0 ? widget.banners.length : 1;
        _controller.jumpToPage(_page);
      }
      _schedule();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.banners.isEmpty) return const SizedBox.shrink();
    final generation = _generation;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return ResponsiveContent(
      maxWidth:
          AppLayout.readingWidth + AppLayout.horizontalScrollInset(context) * 2,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final imageWidth =
              constraints.maxWidth -
              AppLayout.horizontalScrollInset(context) * 2;
          final height = _bannerHeight(context, imageWidth, widget.banners);
          return MouseRegion(
            onEnter: (_) {
              _hovering = true;
              _schedule();
            },
            onExit: (_) {
              _hovering = false;
              _schedule();
            },
            child: Focus(
              onFocusChange: (value) {
                _focused = value;
                _schedule();
              },
              onKeyEvent: (_, event) {
                if (!_multiple || event is! KeyDownEvent) {
                  return KeyEventResult.ignored;
                }
                if (event.logicalKey == LogicalKeyboardKey.arrowRight) {
                  _move(rtl ? -1 : 1);
                  return KeyEventResult.handled;
                }
                if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
                  _move(rtl ? 1 : -1);
                  return KeyEventResult.handled;
                }
                return KeyEventResult.ignored;
              },
              child: Listener(
                onPointerDown: (event) {
                  _pointers.add(event.pointer);
                  _schedule();
                },
                onPointerUp: (event) {
                  _pointers.remove(event.pointer);
                  _schedule();
                },
                onPointerCancel: (event) {
                  _pointers.remove(event.pointer);
                  _schedule();
                },
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      height: height,
                      child: NotificationListener<ScrollNotification>(
                        onNotification: (notification) {
                          if (generation != _generation ||
                              notification.depth != 0) {
                            return false;
                          }
                          if (notification is ScrollStartNotification) {
                            _timer?.cancel();
                          }
                          if (notification is ScrollEndNotification) {
                            _settled(generation);
                          }
                          return false;
                        },
                        child: ScrollConfiguration(
                          behavior: ScrollConfiguration.of(context).copyWith(
                            dragDevices: {
                              ...ScrollConfiguration.of(context).dragDevices,
                              PointerDeviceKind.mouse,
                            },
                          ),
                          // Only the full viewport clips paging. Each image owns
                          // its inset and rounded clip, so both pages can cross
                          // the resting image bounds while tracking a drag.
                          child: PageView.builder(
                            key: ValueKey(generation),
                            controller: _controller,
                            physics: _multiple
                                ? const PageScrollPhysics()
                                : const NeverScrollableScrollPhysics(),
                            itemCount: _multiple
                                ? widget.banners.length + 2
                                : 1,
                            onPageChanged: (page) {
                              if (generation != _generation) return;
                              setState(() {
                                _page = page;
                                _selectedId = widget.banners[_index(page)].id;
                              });
                            },
                            itemBuilder: (context, page) => Padding(
                              padding: AppLayout.horizontalScrollInsets(
                                context,
                                top: 0,
                                bottom: 0,
                              ),
                              child: ClipRRect(
                                key: ValueKey('banner-page-$page'),
                                borderRadius: AppRadii.bannerAll,
                                child: SizedBox.expand(
                                  child: _BannerImageSlide(
                                    banner: widget.banners[_index(page)],
                                    onOpen: widget.onOpen,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    if (_multiple)
                      Padding(
                        padding: EdgeInsetsDirectional.only(
                          top: AppSpacing.sm,
                          start: AppLayout.horizontalScrollInset(context),
                          end: AppLayout.horizontalScrollInset(context),
                        ),
                        child: Semantics(
                          label: context.l10n.bannerPosition(
                            '${_index(_page) + 1}',
                            '${widget.banners.length}',
                          ),
                          child: Center(
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  for (
                                    var i = 0;
                                    i < widget.banners.length;
                                    i++
                                  )
                                    Padding(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: AppSpacing.xs,
                                      ),
                                      child: DecoratedBox(
                                        key: ValueKey(
                                          'banner-dot-$i-${i == _index(_page)}',
                                        ),
                                        decoration: BoxDecoration(
                                          borderRadius: BorderRadius.circular(
                                            AppRadii.pill,
                                          ),
                                          color: i == _index(_page)
                                              ? context.colors.primary
                                              : context.colors.primary
                                                    .withValues(alpha: 0.25),
                                        ),
                                        child: SizedBox(
                                          width: i == _index(_page)
                                              ? AppSpacing.xl
                                              : AppSpacing.sm,
                                          height: AppSpacing.xs,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// PageView needs a bounded height. Measure the supplied copy at the current
// width/text scale, keeping all slides stable in height without clipping text.
double _bannerHeight(
  BuildContext context,
  double width,
  List<HomeBanner> banners,
) {
  double measure(String value, TextStyle? style) {
    if (value.trim().isEmpty) return 0;
    final painter = TextPainter(
      text: TextSpan(text: value, style: style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout(maxWidth: math.max(1, width - AppSpacing.xxl));
    final height = painter.height;
    painter.dispose();
    return height;
  }

  var height = width / AppLayout.homeBannerAspectRatio;
  for (final banner in banners) {
    final title = measure(banner.title, context.text.titleLarge);
    final subtitle = measure(banner.subtitle ?? '', context.text.bodyMedium);
    height = math.max(
      height,
      title +
          subtitle +
          (title > 0 && subtitle > 0 ? AppSpacing.sm : 0) +
          AppSpacing.lg * 2,
    );
  }
  return height;
}

class _BannerImageSlide extends StatelessWidget {
  const _BannerImageSlide({required this.banner, this.onOpen});
  final HomeBanner banner;
  final Future<void> Function(Uri)? onOpen;

  @override
  Widget build(BuildContext context) {
    final link = banner.webLink;
    final canOpen = link != null && onOpen != null;
    return Semantics(
      button: canOpen,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: canOpen ? () => onOpen!(link) : null,
        child: Stack(
          fit: StackFit.expand,
          children: [
            _BannerImage(url: banner.imageUrl),
            DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    context.colors.imageScrim.withValues(alpha: 0.86),
                    context.colors.imageScrim.withValues(alpha: 0.64),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (banner.title.trim().isNotEmpty)
                    Text(
                      banner.title,
                      style: context.text.titleLarge?.copyWith(
                        color: context.colors.onDark,
                      ),
                    ),
                  if (banner.title.trim().isNotEmpty &&
                      banner.subtitle?.trim().isNotEmpty == true)
                    const SizedBox(height: AppSpacing.sm),
                  if (banner.subtitle?.trim().isNotEmpty == true)
                    Text(
                      banner.subtitle!,
                      style: context.text.bodyMedium?.copyWith(
                        color: context.colors.onDark,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BannerImage extends StatelessWidget {
  const _BannerImage({required this.url});
  final String url;
  @override
  Widget build(BuildContext context) {
    Widget fallback() => ColoredBox(
      color: context.colors.surfaceAlt,
      child: Icon(Icons.image_outlined, color: context.colors.textMuted),
    );
    final uri = Uri.tryParse(url);
    if (uri == null ||
        !['https', 'http'].contains(uri.scheme) ||
        uri.host.isEmpty) {
      return fallback();
    }
    return CachedNetworkImage(
      imageUrl: url,
      fit: BoxFit.cover,
      placeholder: (_, _) => const Skeleton.box(),
      errorWidget: (_, _, _) => fallback(),
    );
  }
}

class HomeBannerSkeleton extends StatelessWidget {
  const HomeBannerSkeleton({super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsetsDirectional.fromSTEB(
      AppLayout.horizontalScrollInset(context),
      AppSpacing.lg,
      AppLayout.horizontalScrollInset(context),
      0,
    ),
    child: ResponsiveContent(
      maxWidth: AppLayout.readingWidth,
      child: LayoutBuilder(
        builder: (context, constraints) => Skeleton(
          height: _bannerHeight(context, constraints.maxWidth, const []),
          borderRadius: AppRadii.bannerAll,
        ),
      ),
    ),
  );
}
