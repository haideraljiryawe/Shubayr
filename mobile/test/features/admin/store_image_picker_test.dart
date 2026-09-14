import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shubayr/features/admin/presentation/media/store_image_picker.dart';

class DevicePicker extends ImagePicker {
  List<XFile> files = [];
  ImageSource? source;
  bool? fullMetadata;
  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    this.source = source;
    fullMetadata = requestFullMetadata;
    return files.firstOrNull;
  }

  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async {
    fullMetadata = requestFullMetadata;
    return files;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Uint8List bytes;
  setUpAll(() async {
    final recorder = ui.PictureRecorder();
    Canvas(recorder).drawColor(Colors.red, BlendMode.src);
    final picture = recorder.endRecording();
    final image = await picture.toImage(2, 2);
    bytes = (await image.toByteData(
      format: ui.ImageByteFormat.png,
    ))!.buffer.asUint8List();
    image.dispose();
    picture.dispose();
  });
  test(
    'single and multiple device photos become local bytes without full metadata or camera',
    () async {
      final device = DevicePicker()
        ..files = [
          XFile.fromData(bytes, name: 'one.png', path: 'one.png'),
          XFile.fromData(bytes, name: 'two.png', path: 'two.png'),
        ];
      final picker = StoreImagePicker(picker: device);
      final single = await picker.pick(multiple: false);
      expect(device.source, ImageSource.gallery);
      expect(device.fullMetadata, isFalse);
      expect(single.single.name, 'one.png');
      expect(single.single.bytes, bytes);
      final multiple = await picker.pick(multiple: true);
      expect(multiple.map((i) => i.name), ['one.png', 'two.png']);
      expect(device.fullMetadata, isFalse);
      expect(() => multiple.first.bytes[0] = 0, throwsUnsupportedError);
    },
  );
  test(
    'cancel returns no images and unreadable selection fails atomically',
    () async {
      final device = DevicePicker();
      final picker = StoreImagePicker(picker: device);
      expect(await picker.pick(multiple: false), isEmpty);
      expect(await picker.pick(multiple: true), isEmpty);
      device.files = [
        XFile.fromData(bytes, name: 'good.png'),
        XFile.fromData(Uint8List.fromList([1]), name: 'bad.png'),
      ];
      await expectLater(picker.pick(multiple: true), throwsA(anything));
    },
  );
}
