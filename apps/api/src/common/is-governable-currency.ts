import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';
import { admitCurrency } from '@aura/shared';

/**
 * THE API BOUNDARY FOR CURRENCY (FX-01, point 6).
 *
 * Deliberately NOT `@IsIn(['AED','USD',…])`. A literal list in a DTO is a fourth copy of the answer,
 * and the fourth copy is how this defect happened: a `@IsString()` DTO, an open `currency: string`
 * domain field and a five-member FX type each answered the question differently, and an unchecked
 * cast joined them.
 *
 * This asks `admitCurrency` — the single policy in `@aura/shared` — so the boundary, the domain and
 * the FX authority cannot disagree. When tenant-configured currencies arrive, that function grows a
 * third clause and every caller including this one follows without being edited.
 *
 * The message is the policy's own sentence, so the refusal a user reads names the actual reason:
 * a malformed code and an ungovernable one are different problems.
 */
export function IsGovernableCurrency(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isGovernableCurrency',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => admitCurrency(value).admissible,
        defaultMessage: (args?: ValidationArguments) => {
          const verdict = admitCurrency(args?.value);
          return verdict.admissible ? '' : verdict.detail;
        },
      },
    });
  };
}
