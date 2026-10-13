import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminPolicy } from '../../common/decorators/access-policy.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthenticatedRequestUser } from '../../common/guards/permissions.guard';
import { DeliveryPricingService } from './delivery-pricing.service';
import {
  DeliveryZoneCreateDto,
  DeliveryZonePatchDto,
  DiscountTierCreateDto,
  DiscountTierPatchDto,
  GovernoratePatchDto,
} from './dto/delivery-pricing.dto';

type StaffRequest = Request & { user: AuthenticatedRequestUser };

@Controller('governorates')
export class GovernoratesController {
  constructor(private readonly pricing: DeliveryPricingService) {}

  @Public()
  @Get()
  list() {
    return this.pricing.listPublicGovernorates();
  }
}

@Controller('admin/governorates')
@AdminPolicy('delivery_zones.manage')
export class AdminGovernoratesController {
  constructor(private readonly pricing: DeliveryPricingService) {}

  @Get()
  list() {
    return this.pricing.listGovernorates();
  }

  @Patch(':id')
  update(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: GovernoratePatchDto,
  ) {
    return this.pricing.updateGovernorate(request.user.id, id, input);
  }
}

@Controller('admin/delivery-zones')
@AdminPolicy('delivery_zones.manage')
export class DeliveryZonesController {
  constructor(private readonly pricing: DeliveryPricingService) {}

  @Get()
  list() {
    return this.pricing.listZones();
  }

  @Post()
  create(@Req() request: StaffRequest, @Body() input: DeliveryZoneCreateDto) {
    return this.pricing.createZone(request.user.id, input);
  }

  @Patch(':id')
  update(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: DeliveryZonePatchDto,
  ) {
    return this.pricing.updateZone(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.pricing.deleteZone(request.user.id, id);
  }
}

@Controller('admin/discount-tiers')
@AdminPolicy('discount_tiers.manage')
export class DiscountTiersController {
  constructor(private readonly pricing: DeliveryPricingService) {}

  @Get()
  list() {
    return this.pricing.listTiers();
  }

  @Post()
  create(@Req() request: StaffRequest, @Body() input: DiscountTierCreateDto) {
    return this.pricing.createTier(request.user.id, input);
  }

  @Patch(':id')
  update(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
    @Body() input: DiscountTierPatchDto,
  ) {
    return this.pricing.updateTier(request.user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Req() request: StaffRequest,
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 422 })) id: string,
  ) {
    return this.pricing.deleteTier(request.user.id, id);
  }
}
