import { z } from 'zod';

export const Role = z.enum(['TEACHER', 'STUDENT']);
export type Role = z.infer<typeof Role>;

export const Weekday = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI']);
export type Weekday = z.infer<typeof Weekday>;

export const CardStatus = z.enum(['BACKLOG', 'TODO', 'DOING', 'DONE']);
export type CardStatus = z.infer<typeof CardStatus>;

export const SprintStatus = z.enum(['OPEN', 'CLOSED']);
export type SprintStatus = z.infer<typeof SprintStatus>;

/** KICKOFF = Arranque, FOLLOWUP = Seguimiento, CLOSING = Cierre. */
export const MeetingType = z.enum(['KICKOFF', 'FOLLOWUP', 'CLOSING']);
export type MeetingType = z.infer<typeof MeetingType>;
