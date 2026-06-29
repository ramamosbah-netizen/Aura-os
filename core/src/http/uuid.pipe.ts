import { NotFoundException, PipeTransform } from '@nestjs/common';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

export class ParseUuidOr404Pipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isUuid(value)) throw new NotFoundException();
    return value;
  }
}
