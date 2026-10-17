import type {
  CheckinResponse,
  MeetingDetailResponse,
  MeetingResponse,
  PatchCheckinRequest,
  PutCheckinRequest,
  TodayMeetingResponse,
  UpdateMeetingRequest,
} from '@kanbit/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, apiPut } from '../../lib/api';

/** v1.0 "real time" is polling (spec §12.1): every 10 s, plus focus and reconnect, so check-ins stay fresh. */
export const MEETING_REFETCH_INTERVAL_MS = 10_000;

export const meetingKeys = {
  today: (teamId: string) => ['teams', teamId, 'meetings', 'today'] as const,
  detail: (meetingId: string) => ['meetings', meetingId] as const,
};

/** Today's suggestion and meeting. Polls only while there is no meeting yet, so members see it appear. */
export function useTodayMeeting(teamId: string) {
  return useQuery({
    queryKey: meetingKeys.today(teamId),
    queryFn: () => apiGet<TodayMeetingResponse>(`/teams/${teamId}/meetings/today`),
    refetchInterval: (query) => (query.state.data?.meeting ? false : MEETING_REFETCH_INTERVAL_MS),
  });
}

/** The meeting with its check-ins; the polling source for the page (and, later, the projection). */
export function useMeetingDetail(meetingId: string | null) {
  return useQuery({
    queryKey: meetingKeys.detail(meetingId ?? ''),
    queryFn: () => apiGet<MeetingDetailResponse>(`/meetings/${meetingId}`),
    enabled: meetingId !== null,
    refetchInterval: MEETING_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/** Shows a written meeting at once in both caches (the detail keeps its check-ins). */
function cacheMeeting(client: QueryClient, teamId: string, meeting: MeetingResponse): void {
  client.setQueryData<TodayMeetingResponse>(meetingKeys.today(teamId), (today) =>
    today ? { ...today, meeting } : today,
  );
  client.setQueryData<MeetingDetailResponse>(meetingKeys.detail(meeting.id), (detail) =>
    detail ? { ...detail, ...meeting } : detail,
  );
}

/** Every write refetches when it settles: a 409 means what the user saw is stale, and the reload lets them retry. */
function useMeetingWrite<TVariables>(
  teamId: string,
  write: (variables: TVariables) => Promise<MeetingResponse>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (meeting) => cacheMeeting(client, teamId, meeting),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['meetings'] }),
        client.invalidateQueries({ queryKey: meetingKeys.today(teamId) }),
      ]),
  });
}

/** "Crear reunión de hoy": the server picks the type from the weekday; answers 201. */
export const useCreateMeeting = (teamId: string) =>
  useMeetingWrite(teamId, (_: void) => apiPost<MeetingResponse>(`/teams/${teamId}/meetings`));

/** "Iniciar reunión": idempotent, a repeat keeps the first `startedAt`. */
export const useStartMeeting = (teamId: string) =>
  useMeetingWrite(teamId, (meetingId: string) => apiPost<MeetingResponse>(`/meetings/${meetingId}/start`));

/** "Terminar reunión": idempotent, saves `durationSeconds`. */
export const useEndMeeting = (teamId: string) =>
  useMeetingWrite(teamId, (meetingId: string) => apiPost<MeetingResponse>(`/meetings/${meetingId}/end`));

export type UpdateMeetingVariables = UpdateMeetingRequest & { meetingId: string };

/** Notes and agreements; `expectedUpdatedAt` answers 409 `MEETING_CONFLICT` when someone else saved first. */
export const useUpdateMeeting = (teamId: string) =>
  useMeetingWrite(teamId, ({ meetingId, ...body }: UpdateMeetingVariables) =>
    apiPatch<MeetingResponse>(`/meetings/${meetingId}`, body),
  );

function cacheCheckin(client: QueryClient, meetingId: string, checkin: CheckinResponse): void {
  client.setQueryData<MeetingDetailResponse>(meetingKeys.detail(meetingId), (detail) => {
    if (!detail) return detail;
    const exists = detail.checkins.some((item) => item.userId === checkin.userId);
    return {
      ...detail,
      checkins: exists
        ? detail.checkins.map((item) => (item.userId === checkin.userId ? checkin : item))
        : [...detail.checkins, checkin],
    };
  });
}

function useCheckinWrite<TVariables>(meetingId: string, write: (variables: TVariables) => Promise<CheckinResponse>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (checkin) => cacheCheckin(client, meetingId, checkin),
    onSettled: () => client.invalidateQueries({ queryKey: meetingKeys.detail(meetingId) }),
  });
}

/** `present` defaults to true on the server; the rest of a PUT replaces the whole check-in. */
export type SaveCheckinVariables = Omit<PutCheckinRequest, 'present'> & { present?: boolean };

/**
 * The caller's own check-in. The caller generates `id` once per form (spec §5.3.1), so a retry re-sends it and the
 * PUT stays an idempotent upsert. Answers 201 the first time and 200 later; both are a saved check-in.
 */
export const useSaveMyCheckin = (meetingId: string) =>
  useCheckinWrite(meetingId, (body: SaveCheckinVariables) =>
    apiPut<CheckinResponse>(`/meetings/${meetingId}/checkins/me`, body),
  );

export type CaptureCheckinVariables = PatchCheckinRequest & { userId: string };

/** The moderator captures a teammate's check-in; only the fields sent change. */
export const useCaptureCheckin = (meetingId: string) =>
  useCheckinWrite(meetingId, ({ userId, ...body }: CaptureCheckinVariables) =>
    apiPatch<CheckinResponse>(`/meetings/${meetingId}/checkins/${userId}`, body),
  );
