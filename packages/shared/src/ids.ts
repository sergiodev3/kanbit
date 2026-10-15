import { z } from 'zod';

/**
 * cuid2 identifier: lowercase, starts with a letter, alphanumeric.
 * Client-generated ids (spec §5.3.1) are validated with this schema.
 */
export const cuid2Id = z.cuid2();
export type Cuid2Id = z.infer<typeof cuid2Id>;
