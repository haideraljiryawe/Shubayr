import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shubayr/core/widgets/phone_number_text.dart';

void main() {
  testWidgets(
    'formatted LTR number copies full E164 but preserves partial selection',
    (tester) async {
      String? copied;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        (call) async {
          if (call.method == 'Clipboard.setData') {
            copied = (call.arguments as Map)['text'] as String;
          }
          if (call.method == 'Clipboard.hasStrings') return {'value': true};
          return null;
        },
      );
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      const displayed = '+964 781 110 0070';
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Directionality(
              textDirection: TextDirection.rtl,
              child: PhoneNumberText('+9647811100070', selectable: true),
            ),
          ),
        ),
      );
      final selectable = tester.widget<SelectableText>(
        find.byType(SelectableText),
      );
      expect(selectable.data, displayed);
      expect(selectable.textDirection, TextDirection.ltr);
      final state = tester.state<EditableTextState>(find.byType(EditableText));
      for (final whole in [true, false]) {
        state.widget.focusNode.requestFocus();
        state.userUpdateTextEditingValue(
          TextEditingValue(
            text: displayed,
            selection: TextSelection(
              baseOffset: 0,
              extentOffset: whole ? displayed.length : 4,
            ),
          ),
          SelectionChangedCause.longPress,
        );
        await tester.pump();
        state.showToolbar();
        await tester.pumpAndSettle();
        await tester.tap(find.text('Copy').last);
        await tester.pumpAndSettle();
        expect(copied, whole ? '+9647811100070' : '+964');
      }
    },
  );
}
