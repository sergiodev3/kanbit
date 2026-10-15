/** Inline error text per field; a field without an entry is valid. */
export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/** Spanish text for a field, optionally varying with the zod issue code. */
export type FieldMessages<K extends string> = Record<K, string | ((issueCode: string) => string)>;

interface Issue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
}

/**
 * Maps zod issues to one es-MX message per field. zod messages are English and never shown;
 * each form supplies the copy that describes its own rules.
 */
export function fieldErrorsFrom<K extends string>(
  issues: readonly Issue[],
  messages: FieldMessages<K>,
): FieldErrors<K> {
  const errors: FieldErrors<K> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || !(field in messages)) continue;
    const key = field as K;
    if (errors[key]) continue;
    const message: string | ((issueCode: string) => string) = messages[key];
    errors[key] = typeof message === 'function' ? message(issue.code) : message;
  }
  return errors;
}

/** Field errors in the form's field order, for the error summary. */
export const orderedErrors = <K extends string>(errors: FieldErrors<K>, order: readonly K[]): string[] =>
  order.flatMap((field) => {
    const message = errors[field];
    return message ? [message] : [];
  });
