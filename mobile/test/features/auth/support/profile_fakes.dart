import 'package:shubayr/features/auth/data/auth_repository_mock.dart';
import 'package:shubayr/features/auth/data/user.dart';
import 'package:shubayr/features/auth/domain/profile_update.dart';

class RecordingProfile extends AuthRepositoryMock {
  RecordingProfile() : super(delay: Duration.zero);
  final writes = <Map<String, dynamic>>[];
  Future<User> Function(ProfileUpdate)? onUpdate;
  @override
  Future<User> updateProfile(ProfileUpdate update) {
    writes.add(update.toJson());
    return onUpdate?.call(update) ?? super.updateProfile(update);
  }
}
