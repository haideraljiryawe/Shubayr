import { PartialType } from '@nestjs/swagger';
import { CreateBannerDto } from './create-banner.dto';

// Omitted fields are preserved. Explicit null clears nullable text/schedule
// fields; required title/image fields cannot be cleared.
export class UpdateBannerDto extends PartialType(CreateBannerDto) {}
