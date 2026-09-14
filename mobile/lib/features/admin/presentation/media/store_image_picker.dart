import 'dart:ui' as ui;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../catalog/data/media/catalog_image.dart';

/// Device library/files only. No camera, paths, persistence or remote upload.
class StoreImagePicker {
  StoreImagePicker({ImagePicker? picker}) : _picker = picker ?? ImagePicker();
  final ImagePicker _picker;
  Future<List<LocalCatalogImage>> pick({required bool multiple}) async {
    final picker = _picker;
    final files = multiple
        ? await picker.pickMultiImage(requestFullMetadata: false)
        : [
            ?await picker.pickImage(
              source: ImageSource.gallery,
              requestFullMetadata: false,
            ),
          ];
    final images = <LocalCatalogImage>[];
    for (final file in files) {
      final bytes = await file.readAsBytes();
      // Reject unreadable files before changing the draft, atomically.
      final codec = await ui.instantiateImageCodec(bytes);
      try {
        final frame = await codec.getNextFrame();
        frame.image.dispose();
      } finally {
        codec.dispose();
      }
      images.add(LocalCatalogImage(bytes, name: file.name));
    }
    return images;
  }
}

final storeImagePickerProvider = Provider<StoreImagePicker>(
  (ref) => StoreImagePicker(),
);
