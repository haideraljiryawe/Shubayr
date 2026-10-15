import '../../../core/error/response_decode.dart';
import '../../../core/network/api_client.dart';

class Governorate {
  const Governorate({
    required this.id,
    required this.nameAr,
    required this.nameEn,
    required this.isServed,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final bool isServed;

  factory Governorate.fromJson(Map<String, dynamic> json) => Governorate(
    id: json['id'] as String,
    nameAr: json['name_ar'] as String,
    nameEn: json['name_en'] as String,
    isServed: json['is_served'] as bool,
  );
}

class GovernorateRepository {
  const GovernorateRepository(this._api);
  final ApiClient _api;

  Future<List<Governorate>> fetch() => decodeResponse(() async {
    final rows = await _api.get<List<dynamic>>('/governorates');
    return [
      for (final row in rows) Governorate.fromJson(row as Map<String, dynamic>),
    ];
  });
}
