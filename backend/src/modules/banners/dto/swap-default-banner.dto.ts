import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class SwapDefaultBannerDto {
  @IsUUID()
  outgoing_id!: string;

  @IsUUID()
  incoming_id!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  default_priority?: number;
}
