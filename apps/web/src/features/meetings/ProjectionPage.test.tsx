import type { CheckinResponse, MeetingResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boardFixture, cardFixture, openSprintBoardFixture, OTHER_ID, STUDENT_ID } from '../../test/board-fixtures';
import {
  checkinFixture,
  meetingDetailFixture,
  meetingFixture,
  mockMeetingApi,
  todayFixture,
  type MeetingViewer,
} from '../../test/meeting-fixtures';
import { errorResponse, jsonResponse, renderRoutes, stubMatchMedia } from '../../test/utils';
import { ProjectionPage } from './ProjectionPage';

const routes: RouteObject[] = [
  { path: '/projection', element: <ProjectionPage teamId="t1" /> },
  { path: '/team/meeting', element: <p>Página de la reunión</p> },
];

const STARTED_AT = '2026-10-19T15:05:00.000Z';
const startedMs = Date.parse(STARTED_AT);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Fake timers that still let promises and React Query settle, as in the meeting page polling test. */
const useClock = (nowMs?: number) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  if (nowMs !== undefined) vi.setSystemTime(nowMs);
};

/** The server side of one meeting: GETs read `current`, writes replace it. */
function mockStatefulMeeting(viewer: MeetingViewer, initial: MeetingResponse, checkins: () => CheckinResponse[] = () => []) {
  let current = initial;
  const set = (patch: Partial<MeetingResponse>) => {
    current = { ...current, ...patch };
    return jsonResponse(200, current);
  };
  return mockMeetingApi({
    viewer,
    handlers: {
      'GET /teams/t1/meetings/today': () => jsonResponse(200, todayFixture({ meeting: current })),
      'GET /meetings/m1': () => jsonResponse(200, meetingDetailFixture({ ...current, checkins: checkins() })),
      'POST /meetings/m1/start': () => set({ startedAt: STARTED_AT, updatedAt: STARTED_AT }),
      'POST /meetings/m1/end': () =>
        set({ endedAt: '2026-10-19T15:17:05.000Z', durationSeconds: 725, updatedAt: '2026-10-19T15:17:05.000Z' }),
    },
  });
}

const timer = () => screen.findByRole('timer');

describe('ProjectionPage header', () => {
  it('shows the team, the meeting type with the server date and a way out', async () => {
    mockMeetingApi({ viewer: 'member' });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Equipo Rojo' })).toBeInTheDocument();
    expect(screen.getByText('Arranque · lunes 19 de octubre de 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Salir de proyección' })).toHaveAttribute('href', '/team/meeting');
  });

  it('sends the teacher back to the meeting of the team', async () => {
    mockMeetingApi({ viewer: 'teacher' });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByRole('link', { name: 'Salir de proyección' })).toHaveAttribute(
      'href',
      '/teacher/teams/t1/meeting',
    );
  });

  it('says so when the data cannot load', async () => {
    mockMeetingApi({ handlers: { 'GET /teams/t1/meetings/today': () => errorResponse(404, 'TEAM_NOT_FOUND') } });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el equipo.');
  });
});

describe('ProjectionPage without a meeting', () => {
  it('explains it and links to the meeting page instead of creating one', async () => {
    mockMeetingApi({ viewer: 'moderator', today: todayFixture() });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByText(/Todavía no hay reunión de hoy/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a la reunión de hoy' })).toHaveAttribute('href', '/team/meeting');
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Crear reunión de hoy' })).not.toBeInTheDocument();
  });

  it('explains why there is no meeting on the weekend', async () => {
    mockMeetingApi({
      viewer: 'member',
      board: openSprintBoardFixture({ today: { date: '2026-10-24', weekday: null } }),
      today: todayFixture({ suggestedType: null, date: '2026-10-24' }),
    });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByText(/Hoy es fin de semana/)).toBeInTheDocument();
  });
});

describe('ProjectionPage countdown', () => {
  it('shows 15:00, not started, with no controls for a member', async () => {
    mockMeetingApi({ viewer: 'member' });

    renderRoutes(routes, ['/projection']);

    expect(await timer()).toHaveTextContent('15:00');
    expect(screen.getByText('Sin iniciar')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['moderator', 'teacher'] as const)('offers %s the start, and no pause or reset yet', async (viewer) => {
    mockMeetingApi({ viewer });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByRole('button', { name: 'Iniciar' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reiniciar' })).not.toBeInTheDocument();
  });

  it('starts the meeting on the server, counts down, pauses, resumes and resets', async () => {
    useClock();
    const fetchMock = mockStatefulMeeting('moderator', meetingFixture());
    renderRoutes(routes, ['/projection']);

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar' }));
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meetings/m1/start', expect.objectContaining({ method: 'POST' }));

    await vi.advanceTimersByTimeAsync(3000);
    expect(await timer()).toHaveTextContent(/^14:5[67]$/);

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    const paused = (await timer()).textContent;
    await vi.advanceTimersByTimeAsync(5000);
    expect(await timer()).toHaveTextContent(paused ?? '');
    expect(screen.getByText(/En pausa/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await timer()).not.toHaveTextContent(paused ?? '');

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(await timer()).toHaveTextContent('15:00');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3000);
    expect(await timer()).toHaveTextContent('15:00');
  });

  it('does not call the server again when restarting a meeting that already started', async () => {
    useClock(startedMs + 20_200);
    const fetchMock = mockStatefulMeeting('moderator', meetingFixture({ startedAt: STARTED_AT }));
    renderRoutes(routes, ['/projection']);
    await waitFor(async () => expect(await timer()).toHaveTextContent('14:40'));

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar' }));

    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/start'))).toHaveLength(0);
  });

  it('keeps the start disabled while offline when the server has not seen it', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockMeetingApi({ viewer: 'moderator' });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByRole('button', { name: 'Iniciar' })).toBeDisabled();
  });

  it('explains a refused start', async () => {
    mockMeetingApi({
      viewer: 'moderator',
      handlers: { 'POST /meetings/m1/start': () => errorResponse(409, 'MEETING_ENDED') },
    });
    renderRoutes(routes, ['/projection']);

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La reunión ya terminó.');
    expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
  });
});

describe('ProjectionPage after a reload mid-meeting', () => {
  it('resumes from the time since the server startedAt, read only for a member', async () => {
    useClock(startedMs + 125_200);
    mockMeetingApi({ viewer: 'member', today: todayFixture({ meeting: meetingFixture({ startedAt: STARTED_AT }) }), detail: meetingDetailFixture({ startedAt: STARTED_AT }) });

    renderRoutes(routes, ['/projection']);

    await waitFor(async () => expect(await timer()).toHaveTextContent('12:55'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(await timer()).toHaveTextContent(/^12:5[23]$/);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('picks the countdown up when a member sees the meeting start while polling', async () => {
    useClock(startedMs + 30_200);
    let started = false;
    mockMeetingApi({
      viewer: 'member',
      handlers: {
        'GET /teams/t1/meetings/today': () => jsonResponse(200, todayFixture({ meeting: meetingFixture() })),
        'GET /meetings/m1': () =>
          jsonResponse(200, meetingDetailFixture(started ? { startedAt: STARTED_AT } : {})),
      },
    });
    renderRoutes(routes, ['/projection']);
    expect(await timer()).toHaveTextContent('15:00');

    started = true;
    await vi.advanceTimersByTimeAsync(10_500);

    await waitFor(async () => expect(await timer()).toHaveTextContent(/^14:(1[89]|2[0-2])$/));
  });

  it.each([
    [300.2, 'GREEN', 'En tiempo'],
    [700.2, 'YELLOW', 'Últimos 5 minutos'],
    [870.2, 'RED', 'Último minuto'],
    [1000.2, 'TIME_UP', 'Tiempo'],
  ] as const)('shows the %f s mark in the %s phase with its text label', async (elapsed, phase, label) => {
    useClock(startedMs + elapsed * 1000);
    mockMeetingApi({
      viewer: 'member',
      today: todayFixture({ meeting: meetingFixture({ startedAt: STARTED_AT }) }),
      detail: meetingDetailFixture({ startedAt: STARTED_AT }),
    });

    renderRoutes(routes, ['/projection']);

    await waitFor(async () => expect(await screen.findByTestId('countdown')).toHaveAttribute('data-phase', phase));
    expect(screen.getByTestId('phase-label')).toHaveTextContent(label);
  });

  it('turns from green to yellow to red as the minutes pass', async () => {
    useClock(startedMs + 598_200);
    mockMeetingApi({
      viewer: 'member',
      today: todayFixture({ meeting: meetingFixture({ startedAt: STARTED_AT }) }),
      detail: meetingDetailFixture({ startedAt: STARTED_AT }),
    });
    renderRoutes(routes, ['/projection']);
    await waitFor(() => expect(screen.getByTestId('countdown')).toHaveAttribute('data-phase', 'GREEN'));

    await vi.advanceTimersByTimeAsync(2500);
    await waitFor(() => expect(screen.getByTestId('countdown')).toHaveAttribute('data-phase', 'YELLOW'));

    await vi.advanceTimersByTimeAsync(240_000);
    await waitFor(() => expect(screen.getByTestId('countdown')).toHaveAttribute('data-phase', 'RED'));
  });

  it('blinks "Tiempo" at 00:00 and keeps it still for people who prefer reduced motion', async () => {
    useClock(startedMs + 1000_200);
    const meetingApi = () =>
      mockMeetingApi({
        viewer: 'member',
        today: todayFixture({ meeting: meetingFixture({ startedAt: STARTED_AT }) }),
        detail: meetingDetailFixture({ startedAt: STARTED_AT }),
      });
    meetingApi();
    const first = renderRoutes(routes, ['/projection']);

    await waitFor(() => expect(screen.getByTestId('phase-label')).toHaveTextContent('Tiempo'));
    expect(await timer()).toHaveTextContent('00:00');
    expect(screen.getByTestId('countdown')).toHaveAttribute('data-blinking', 'true');
    first.unmount();

    stubMatchMedia(true);
    meetingApi();
    renderRoutes(routes, ['/projection']);

    await waitFor(() => expect(screen.getByTestId('phase-label')).toHaveTextContent('Tiempo'));
    expect(screen.getByTestId('countdown')).toHaveAttribute('data-blinking', 'false');
  });
});

describe('ProjectionPage ending the meeting', () => {
  it('ends it on the server, freezes on "Tiempo" with the saved duration and removes the controls', async () => {
    useClock(startedMs + 60_200);
    const fetchMock = mockStatefulMeeting('teacher', meetingFixture({ startedAt: STARTED_AT }));
    renderRoutes(routes, ['/projection']);

    fireEvent.click(await screen.findByRole('button', { name: 'Terminar reunión' }));

    expect(await screen.findByText('Duración: 12 min 05 s')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/meetings/m1/end', expect.objectContaining({ method: 'POST' }));
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Tiempo');
    expect(screen.getByTestId('countdown')).toHaveAttribute('data-blinking', 'false');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const frozen = (await timer()).textContent;
    await vi.advanceTimersByTimeAsync(5000);
    expect(await timer()).toHaveTextContent(frozen ?? '');
  });

  it('shows an already ended meeting frozen with its duration', async () => {
    mockMeetingApi({
      viewer: 'member',
      today: todayFixture({ meeting: meetingFixture({ startedAt: STARTED_AT, endedAt: '2026-10-19T15:17:05.000Z', durationSeconds: 725 }) }),
      detail: meetingDetailFixture({ startedAt: STARTED_AT, endedAt: '2026-10-19T15:17:05.000Z', durationSeconds: 725 }),
    });

    renderRoutes(routes, ['/projection']);

    expect(await screen.findByText('Reunión terminada')).toBeInTheDocument();
    expect(screen.getByText('Duración: 12 min 05 s')).toBeInTheDocument();
    expect(screen.getByTestId('phase-label')).toHaveTextContent('Tiempo');
  });

  it('only offers "Terminar reunión" once the meeting started', async () => {
    mockMeetingApi({ viewer: 'moderator' });

    renderRoutes(routes, ['/projection']);

    await screen.findByRole('button', { name: 'Iniciar' });
    expect(screen.queryByRole('button', { name: 'Terminar reunión' })).not.toBeInTheDocument();
  });
});

describe('ProjectionPage check-ins', () => {
  const answered = checkinFixture({
    userId: STUDENT_ID,
    did: 'Terminé el login',
    doing: 'Probando la API',
    willDo: 'Escribir pruebas',
    blockers: null,
  });

  it('shows every member with the answers large and marks who has no check-in', async () => {
    mockMeetingApi({ viewer: 'member', detail: meetingDetailFixture({ checkins: [answered] }) });

    renderRoutes(routes, ['/projection']);

    const section = await screen.findByRole('region', { name: 'Check-ins del equipo' });
    const luis = within(section).getByRole('heading', { name: 'Luis Alumno' }).closest('li') as HTMLElement;
    expect(within(luis).getByText('Terminé el login')).toBeInTheDocument();
    expect(within(luis).getByText('¿Qué me bloquea?')).toBeInTheDocument();
    expect(within(luis).getByText('Sin respuesta')).toBeInTheDocument();
    const ana = within(section).getByRole('heading', { name: 'Ana López' }).closest('li') as HTMLElement;
    expect(within(ana).getByText('Sin check-in')).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
  });

  it('shows a check-in sent from a phone after the next poll, without reloading', async () => {
    useClock();
    let checkins: CheckinResponse[] = [];
    mockStatefulMeeting('member', meetingFixture(), () => checkins);
    renderRoutes(routes, ['/projection']);
    const section = await screen.findByRole('region', { name: 'Check-ins del equipo' });
    expect(within(section).queryByText('Terminé el login')).not.toBeInTheDocument();

    checkins = [answered];
    await vi.advanceTimersByTimeAsync(10_500);

    expect(await within(section).findByText('Terminé el login')).toBeInTheDocument();
  });
});

describe('ProjectionPage compact board', () => {
  it('shows a row per member with the card titles in their columns', async () => {
    mockMeetingApi({ viewer: 'member' });

    renderRoutes(routes, ['/projection']);

    const board = await screen.findByRole('table', { name: 'Tablero del equipo' });
    expect(within(board).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Integrante',
      'Backlog',
      'Por hacer',
      'En marcha',
      'Terminado',
    ]);
    const luis = within(board).getByRole('rowheader', { name: /Luis Alumno/ }).closest('tr') as HTMLElement;
    const cells = within(luis).getAllByRole('cell');
    expect(within(cells[0] as HTMLElement).getByText('Pruebas de API')).toBeInTheDocument();
    expect(within(cells[1] as HTMLElement).getByText('Login con JWT')).toBeInTheDocument();
    const ana = within(board).getByRole('rowheader', { name: /Ana López/ }).closest('tr') as HTMLElement;
    expect(within(within(ana).getAllByRole('cell')[2] as HTMLElement).getByText('Pantalla de tablero')).toBeInTheDocument();
  });

  it('is read only: no buttons, links or drag handles on the cards', async () => {
    mockMeetingApi({ viewer: 'moderator' });

    renderRoutes(routes, ['/projection']);

    const board = await screen.findByRole('table', { name: 'Tablero del equipo' });
    expect(within(board).queryByRole('button')).not.toBeInTheDocument();
    expect(within(board).queryByRole('link')).not.toBeInTheDocument();
  });

  it('adds the unassigned row only when it has cards, and caps long cells', async () => {
    const crowded = openSprintBoardFixture({
      cards: ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
        cardFixture({ id: `c${id}`, title: `Tarea ${id}`, assigneeId: OTHER_ID, status: 'TODO', position: `a${index}` }),
      ),
    });
    mockMeetingApi({ viewer: 'member', board: crowded });

    renderRoutes(routes, ['/projection']);

    const board = await screen.findByRole('table', { name: 'Tablero del equipo' });
    expect(within(board).queryByRole('rowheader', { name: /Sin asignar/ })).not.toBeInTheDocument();
    const carla = within(board).getByRole('rowheader', { name: /Carla Díaz/ }).closest('tr') as HTMLElement;
    const todo = within(carla).getAllByRole('cell')[1] as HTMLElement;
    expect(within(todo).getByText('Tarea a')).toBeInTheDocument();
    expect(within(todo).getByText('Tarea c')).toBeInTheDocument();
    expect(within(todo).queryByText('Tarea d')).not.toBeInTheDocument();
    expect(within(todo).getByText('+2 más')).toBeInTheDocument();
  });

  it('shows the unassigned row when it holds cards', async () => {
    mockMeetingApi({ viewer: 'member', board: boardFixture({ today: { date: '2026-10-19', weekday: 'MON' } }) });

    renderRoutes(routes, ['/projection']);

    const board = await screen.findByRole('table', { name: 'Tablero del equipo' });
    expect(within(board).getByRole('rowheader', { name: /Sin asignar/ })).toBeInTheDocument();
    expect(within(board).getByText('Diseñar logo')).toBeInTheDocument();
  });
});

describe('ProjectionPage wake lock', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('keeps the screen on while open and lets it go when leaving', async () => {
    const release = vi.fn(async () => undefined);
    const request = vi.fn(async (_type: string) => ({ released: false, release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    mockMeetingApi({ viewer: 'member' });

    const { unmount } = renderRoutes(routes, ['/projection']);

    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await waitFor(() => expect(release).not.toHaveBeenCalled());
    unmount();
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });
});
