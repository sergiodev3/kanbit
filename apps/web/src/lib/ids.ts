import { createId } from '@paralleldrive/cuid2';

/** Client-generated record id (spec §5.3.1): a cuid2, validated by the API with the shared schema. */
export const newId = (): string => createId();
