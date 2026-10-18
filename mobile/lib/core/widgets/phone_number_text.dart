import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../utils/international_phone.dart';
import 'app_text_selection_toolbar.dart';

/// Display-only international formatting; never infer a country for legacy data.
class PhoneNumberText extends StatelessWidget {
  const PhoneNumberText(
    this.number, {
    super.key,
    this.style,
    this.textAlign,
    this.selectable = false,
  });
  final String number;
  final TextStyle? style;
  final TextAlign? textAlign;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    final display = InternationalPhone.display(number);
    if (!selectable) {
      return Text(
        display,
        style: style,
        textAlign: textAlign,
        textDirection: TextDirection.ltr,
      );
    }
    return SelectableText(
      display,
      style: style,
      textAlign: textAlign,
      textDirection: TextDirection.ltr,
      contextMenuBuilder: (context, state) {
        final selection = state.textEditingValue.selection;
        final wholeNumber =
            selection.start == 0 && selection.end == display.length;
        return appTextSelectionToolbar(
          context,
          state,
          buttonItems: [
            for (final item in state.contextMenuButtonItems)
              if (item.type == ContextMenuButtonType.copy && wholeNumber)
                ContextMenuButtonItem(
                  type: ContextMenuButtonType.copy,
                  onPressed: () {
                    Clipboard.setData(
                      ClipboardData(
                        text: InternationalPhone.canonical(number) ?? number,
                      ),
                    );
                    state.hideToolbar();
                  },
                )
              else
                item,
          ],
        );
      },
    );
  }
}
