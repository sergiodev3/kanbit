import { z } from 'zod';

/** `POST /users/:id/reset-password`: the temporary password is shown to the teacher once. */
export const ResetPasswordResponse = z.object({
  temporaryPassword: z.string().min(1),
});
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponse>;
