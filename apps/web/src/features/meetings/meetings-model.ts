import type { BoardResponse, CheckinResponse, MeetingType } from '@kanbit/shared';

type BoardMember = BoardResponse['members'][number];

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  KICKOFF: 'Arranque',
  FOLLOWUP: 'Seguimiento',
  CLOSING: 'Cierre',
};

export const meetingTypeLabel = (type: MeetingType): string => MEETING_TYPE_LABELS[type];

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/**
 * "lunes 19 de octubre de 2026". Display only: a calendar date read as UTC midnight is the same day in any zone,
 * so no device clock or zone is involved. Fixed names instead of `Intl`, whose output varies between ICU builds.
 */
export function formatMeetingDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} de ${MONTHS[date.getUTCMonth()]} de ${date.getUTCFullYear()}`;
}

/** The saved meeting duration: "12 min 05 s". */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

export type NoMeetingReason = 'no-open-sprint' | 'weekend';

export const NO_MEETING_MESSAGES: Record<NoMeetingReason, string> = {
  'no-open-sprint': 'No hay un sprint abierto, así que hoy no hay reunión. El moderador debe iniciar el sprint de la semana.',
  weekend: 'Hoy es fin de semana: las reuniones son de lunes a viernes.',
};

/**
 * Why no meeting can be created today, told apart with the board's server-side `today` and `sprint` (the API
 * answers a null suggestion for both). The sprint is checked first, as the API does when creating.
 */
export function noMeetingReason(board: Pick<BoardResponse, 'sprint' | 'today'>): NoMeetingReason | null {
  if (!board.sprint) return 'no-open-sprint';
  if (board.today.weekday === null) return 'weekend';
  return null;
}

export interface CheckinRow {
  member: BoardMember;
  checkin: CheckinResponse | null;
}

/** Every current member in board row order, with their check-in or null. Check-ins of former members are dropped. */
export function checkinRows(members: readonly BoardMember[], checkins: readonly CheckinResponse[]): CheckinRow[] {
  const byUser = new Map(checkins.map((checkin) => [checkin.userId, checkin]));
  return [...members]
    .sort((a, b) => a.rowOrder - b.rowOrder)
    .map((member) => ({ member, checkin: byUser.get(member.userId) ?? null }));
}

export const CHECKIN_FIELDS = ['did', 'doing', 'willDo', 'blockers'] as const;
export type CheckinField = (typeof CHECKIN_FIELDS)[number];

/** The four daily questions (spec §5.3), in the order they are asked. */
export const CHECKIN_QUESTIONS: Record<CheckinField, string> = {
  did: '¿Qué hice?',
  doing: '¿Qué estoy haciendo?',
  willDo: '¿Qué voy a hacer?',
  blockers: '¿Qué me bloquea?',
};

export type CheckinTexts = Record<CheckinField, string>;

export const checkinTextsOf = (checkin: CheckinResponse | null): CheckinTexts => ({
  did: checkin?.did ?? '',
  doing: checkin?.doing ?? '',
  willDo: checkin?.willDo ?? '',
  blockers: checkin?.blockers ?? '',
});

/** The moderator's capture sends only what changed (trimmed, as the API stores it). */
export function changedCheckinTexts(values: CheckinTexts, saved: CheckinResponse | null): Partial<CheckinTexts> {
  const original = checkinTextsOf(saved);
  const changed: Partial<CheckinTexts> = {};
  for (const field of CHECKIN_FIELDS) {
    const text = values[field].trim();
    if (text !== original[field].trim()) changed[field] = text;
  }
  return changed;
}
