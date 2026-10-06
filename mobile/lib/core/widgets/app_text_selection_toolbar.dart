import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../theme/tokens/app_typography.dart';

/// Preserve Flutter's adaptive menu actions and geometry while giving iOS
/// toolbar labels a family: their SDK style has inherit:false and no family.
Widget appTextSelectionToolbar(BuildContext context, EditableTextState state) {
  final buttons = AdaptiveTextSelectionToolbar.getAdaptiveButtons(
    context,
    state.contextMenuButtonItems,
  );
  return AdaptiveTextSelectionToolbar(
    anchors: state.contextMenuAnchors,
    children: [
      for (final button in buttons)
        if (button is CupertinoTextSelectionToolbarButton &&
            button.buttonItem != null &&
            button.buttonItem!.type != ContextMenuButtonType.liveTextInput)
          CupertinoTextSelectionToolbarButton(
            onPressed: button.onPressed,
            child: Text(
              CupertinoTextSelectionToolbarButton.getButtonLabel(
                context,
                button.buttonItem!,
              ),
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                inherit: false,
                fontFamily: AppTypography.fontFamily,
                fontSize: 15,
                letterSpacing: -0.15,
                fontWeight: FontWeight.w400,
                color: button.onPressed == null
                    ? CupertinoColors.inactiveGray.resolveFrom(context)
                    : CupertinoDynamicColor.withBrightness(
                        color: CupertinoColors.black,
                        darkColor: CupertinoColors.white,
                      ).resolveFrom(context),
              ),
            ),
          )
        else
          button,
    ],
  );
}
