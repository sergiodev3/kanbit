import type { MeetingResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture, openSprintBoardFixture } from '../../test/board-fixtures';
import {
  meetingDetailFixture,
  meetingFixture,
  mockMeetingApi,
  todayFixture,
  type MeetingViewer,
} from '../../test/meeting-fixtures';
import { errorResponse, jsonResponse, renderRoutes } from '../../test/utils';
import { MeetingPage } from './MeetingPage';

const routes: RouteObject[] = [{ path: '/meeting', element: <MeetingPage teamId="t1" /> }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The server side of one meeting: GETs read `current`, writes replace it, like the real API would. */
function mockStatefulMeeting(viewer: MeetingViewer, initial: MeetingResponse | null, extra: Partial<MeetingResponse> = {}) {
  let current = initial;
  const set = (patch: Partial<MeetingResponse>) => {
    current = { ...(current ?? meetingFixture()), ...patch };
    return jsonResponse(200, current);
  };
  const fetchMock = mockMeetingApi({
    viewer,
    handlers: {
      'GET /teams/t1/meetings/today': () => jsonResponse(200, todayFixture({ meeting: current })),
      'GET /meetings/m1': () => jsonResponse(200, meetingDetailFixture({ ...(current ?? meetingFixture()) })),
      'POST /teams/t1/meetings': () => {
        current = meetingFixture(extra);
        return jsonResponse(201, current);
      },
      'POST /meetings/m1/start': () => set({ startedAt: '2026-10-19T15:05:00.000Z', updatedAt: '2026-10-19T15:05:00.000Z' }),
      'POST /meetings/m1/end': () =>
        set({ endedAt: '2026-10-19T15:17:05.000Z', durationSeconds: 725, updatedAt: '2026-10-19T15:17:05.000Z' }),
    },
  });
  return fetchMock;
}

describe('MeetingPage header', () => {
  it('suggests Arranque on Monday with the server date', async () => {
    mockMeetingApi({ viewer: 'moderator', today: todayFixture() });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Reunión de hoy' })).toBeInTheDocument();
    expect(screen.getByText('Arranque · lunes 19 de octubre de 2026')).toBeInTheDocument();
  });

  it.each([
    ['TUE', '2026-10-20', 'FOLLOWUP', 'Seguimiento · martes 20 de octubre de 2026'],
    ['WED', '2026-10-21', 'FOLLOWUP', 'Seguimiento · miércoles 21 de octubre de 2026'],
    ['THU', '2026-10-22', 'FOLLOWUP', 'Seguimiento · jueves 22 de octubre de 2026'],
    ['FRI', '2026-10-23', 'CLOSING', 'Cierre · viernes 23 de octubre de 2026'],
  ] as const)('suggests the type for %s', async (weekday, date, suggestedType, text) => {
    mockMeetingApi({
      viewer: 'moderator',
      board: openSprintBoardFixture({ today: { date, weekday } }),
      today: todayFixture({ suggestedType, date }),
    });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows the type of the existing meeting', async () => {
    mockMeetingApi({
      viewer: 'member',
      today: todayFixture({ meeting: meetingFixture({ type: 'KICKOFF' }) }),
    });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText('Arranque · lunes 19 de octubre de 2026')).toBeInTheDocument();
  });

  it('explains that there is no meeting without an open sprint', async () => {
    mockMeetingApi({
      viewer: 'moderator',
      board: boardFixture(),
      today: todayFixture({ suggestedType: null, date: '2026-10-16' }),
    });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText(/No hay un sprint abierto, así que hoy no hay reunión/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear reunión de hoy' })).not.toBeInTheDocument();
  });

  it('explains that the weekend has no meeting', async () => {
    mockMeetingApi({
      viewer: 'moderator',
      board: openSprintBoardFixture({ today: { date: '2026-10-24', weekday: null } }),
      today: todayFixture({ suggestedType: null, date: '2026-10-24' }),
    });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText(/Hoy es fin de semana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear reunión de hoy' })).not.toBeInTheDocument();
  });

  it('says so when the page cannot load', async () => {
    mockMeetingApi({
      handlers: { 'GET /teams/t1/meetings/today': () => errorResponse(404, 'TEAM_NOT_FOUND') },
    });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el equipo.');
  });
});

describe('MeetingPage projection link', () => {
  it.each([
    ['moderator', '/team/meeting/projection'],
    ['member', '/team/meeting/projection'],
    ['teacher', '/teacher/teams/t1/meeting/projection'],
  ] as const)('offers %s the projection at %s', async (viewer, href) => {
    mockMeetingApi({ viewer });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByRole('link', { name: 'Proyectar' })).toHaveAttribute('href', href);
  });
});

describe('MeetingPage create, start and end', () => {
  it('lets the moderator create the day meeting, then shows it unstarted', async () => {
    const fetchMock = mockStatefulMeeting('moderator', null);

    renderRoutes(routes, ['/meeting']);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear reunión de hoy' }));

    expect(await screen.findByText('Estado: Sin iniciar')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear reunión de hoy' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar reunión' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/teams/t1/meetings', expect.objectContaining({ method: 'POST' }));
  });

  it('lets the teacher create the meeting too', async () => {
    mockStatefulMeeting('teacher', null);

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByRole('button', { name: 'Crear reunión de hoy' })).toBeEnabled();
  });

  it('explains a failed creation in Spanish', async () => {
    mockMeetingApi({
      viewer: 'moderator',
      today: todayFixture(),
      handlers: { 'POST /teams/t1/meetings': () => errorResponse(409, 'MEETING_ALREADY_EXISTS') },
    });

    renderRoutes(routes, ['/meeting']);
    fireEvent.click(await screen.findByRole('button', { name: 'Crear reunión de hoy' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La reunión de hoy ya existe.');
  });

  it('shows members a plain wait message and no management buttons', async () => {
    mockMeetingApi({ viewer: 'member', today: todayFixture() });

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText(/Todavía no hay reunión de hoy/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear reunión de hoy' })).not.toBeInTheDocument();
  });

  it('shows members the meeting state without start or end buttons', async () => {
    mockStatefulMeeting('member', meetingFixture({ startedAt: '2026-10-19T15:05:00.000Z' }));

    renderRoutes(routes, ['/meeting']);

    expect(await screen.findByText('Estado: En curso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar reunión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminar reunión' })).not.toBeInTheDocument();
  });

  it('starts the meeting and offers to end it', async () => {
    const fetchMock = mockStatefulMeeting('moderator', meetingFixture());

    renderRoutes(routes, ['/meeting']);
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar reunión' }));

    expect(await screen.findByText('Estado: En curso')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminar reunión' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Iniciar reunión' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meetings/m1/start', expect.objectContaining({ method: 'POST' }));
  });

  it('ends the meeting and shows the saved duration', async () => {
    const fetchMock = mockStatefulMeeting('teacher', meetingFixture({ startedAt: '2026-10-19T15:05:00.000Z' }));

    renderRoutes(routes, ['/meeting']);
    fireEvent.click(await screen.findByRole('button', { name: 'Terminar reunión' }));

    expect(await screen.findByText('Estado: Terminada')).toBeInTheDocument();
    expect(screen.getByText('Duración: 12 min 05 s')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminar reunión' })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meetings/m1/end', expect.objectContaining({ method: 'POST' }));
  });

  it('explains a refused start', async () => {
    mockMeetingApi({
      viewer: 'moderator',
      handlers: { 'POST /meetings/m1/start': () => errorResponse(409, 'MEETING_ENDED') },
    });

    renderRoutes(routes, ['/meeting']);
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar reunión' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La reunión ya terminó.');
  });

  it('disables creating, starting and ending while offline, with a notice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockMeetingApi({ viewer: 'moderator', today: todayFixture() });
    const first = renderRoutes(routes, ['/meeting']);

    expect(await screen.findByRole('button', { name: 'Crear reunión de hoy' })).toBeDisabled();
    expect(screen.getByText(/Sin conexión: no puedes guardar cambios de la reunión/)).toBeInTheDocument();
    first.unmount();

    mockMeetingApi({ viewer: 'moderator' });
    renderRoutes(routes, ['/meeting']);
    expect(await screen.findByRole('button', { name: 'Iniciar reunión' })).toBeDisabled();
  });

  it('keeps the buttons enabled again online', async () => {
    mockMeetingApi({ viewer: 'moderator' });

    renderRoutes(routes, ['/meeting']);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar reunión' })).toBeEnabled());
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  });
});

describe('MeetingPage polling', () => {
  it('reloads the meeting every 10 seconds so check-ins stay fresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = mockMeetingApi({ viewer: 'member' });
      renderRoutes(routes, ['/meeting']);
      await screen.findByText('Estado: Sin iniciar');
      const detailCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/meetings/m1')).length;
      const before = detailCalls();

      await vi.advanceTimersByTimeAsync(10_500);

      expect(detailCalls()).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});
