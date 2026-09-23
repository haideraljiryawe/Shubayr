import { PipeTransform, UnprocessableEntityException } from '@nestjs/common';

/** Runs after DTO validation; class fields initialized to undefined are omitted. */
export class NonEmptyPatchPipe implements PipeTransform {
  transform(value: Record<string, unknown>) {
    if (!Object.values(value).some((field) => field !== undefined)) {
      throw new UnprocessableEntityException(
        'PATCH body must contain at least one field',
      );
    }
    return value;
  }
}
