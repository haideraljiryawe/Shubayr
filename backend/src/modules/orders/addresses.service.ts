import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { conflict } from '../../common/http/api-error';
import {
  AddressCreateDto,
  AddressPatchDto,
  AddressQueryDto,
} from './dto/address-write.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query: AddressQueryDto) {
    const page = query.page ?? 1;
    const per_page = query.per_page ?? 20;
    const [total, data] = await this.prisma.$transaction([
      this.prisma.address.count({ where: { user_id: userId } }),
      this.prisma.address.findMany({
        where: { user_id: userId },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * per_page,
        take: per_page,
      }),
    ]);
    return { page, per_page, total, data };
  }

  async get(userId: string, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  async create(userId: string, input: AddressCreateDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const count = await tx.address.count({ where: { user_id: userId } });
      const isDefault = count === 0 || input.is_default === true;
      if (isDefault)
        await tx.address.updateMany({
          where: { user_id: userId, is_default: true },
          data: { is_default: false },
        });
      return tx.address.create({
        data: { ...input, user_id: userId, is_default: isDefault },
      });
    });
  }

  async update(userId: string, id: string, input: AddressPatchDto) {
    if (!Object.keys(input).length)
      throw new UnprocessableEntityException('At least one field is required');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.address.findFirst({
        where: { id, user_id: userId },
      });
      if (!current) throw new NotFoundException('Address not found');
      if (input.is_default === false && current.is_default)
        throw conflict(
          'ONLY_DEFAULT_ADDRESS_REQUIRED',
          'The only default cannot be cleared; set another address as default',
        );
      if (input.is_default === true)
        await tx.address.updateMany({
          where: { user_id: userId, is_default: true },
          data: { is_default: false },
        });
      return tx.address.update({ where: { id }, data: input });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.address.findFirst({
        where: { id, user_id: userId },
      });
      if (!current) throw new NotFoundException('Address not found');
      await tx.address.delete({ where: { id } });
      if (current.is_default) {
        const oldest = await tx.address.findFirst({
          where: { user_id: userId },
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        });
        if (oldest)
          await tx.address.update({
            where: { id: oldest.id },
            data: { is_default: true },
          });
      }
    });
  }
}
