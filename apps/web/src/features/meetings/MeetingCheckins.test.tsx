import { CHECKIN_TEXT_MAX_LENGTH, type CheckinResponse, type MeetingResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkinFixture,
  MEETING_ID,
  meetingDetailFixture,
  meetingFixture,
  mockMeetingApi,
  MODERATOR_ID,
  OTHER_ID,
  STUDENT_ID,
  type MeetingApiOptions,
  type MeetingViewer,
} from '../../test/meeting-fixtures';
import { errorResponse, jsonResponse, renderRoutes } from '../../test/utils';
import { MeetingPage } from './MeetingPage';

const routes: RouteObject[] = [{ path: '/meeting', element: <MeetingPage teamId="t1" /> }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NEW_STAMP = '2026-10-19T16:00:00.000Z';

interface Setup {
  viewer?: MeetingViewer;
  meeting?: MeetingResponse;
  checkins?: CheckinResponse[];
  handlers?: NonNullable<MeetingApiOptions['handlers']>;
}

function renderMeeting({ viewer = 'member', meeting = meetingFixture(), checkins = [], handlers = {} }: Setup = {}) {
  const fetchMock = mockMeetingApi({
    viewer,
    today: { suggestedType: 'KICKOFF', date: '2026-10-19', meeting },
    detail: meetingDetailFixture({ ...meeting, checkins }),
    handlers,
  });
  return { fetchMock, ...renderRoutes(routes, ['/meeting']) };
}

const ownForm = () => screen.findByRole('form', { name: 'Mi check-in' });
const field = (form: HTMLElement, question: string) => within(form).getByLabelText(question);
const type = (form: HTMLElement, question: string, value: string) =>
  fireEvent.change(field(form, question), { target: { value } });

/** The parsed JSON bodies of every request matching `"METHOD /path"`, in order. */
const bodiesOf = (fetchMock: ReturnType<typeof mockMeetingApi>, method: string, path: string) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url) === `/api/v1${path}` && (init?.method ?? 'GET') === method)
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

const listItem = async (name: string) => {
  const heading = await screen.findByRole('heading', { name });
  return heading.closest('li') as HTMLElement;
};

describe('own check-in form', () => {
  it('shows a member four empty labelled questions', async () => {
    renderMeeting();

    const form = await ownForm();
    for (const question of ['¿Qué hice?', '¿Qué estoy haciendo?', '¿Qué voy a hacer?', '¿Qué me bloquea?']) {
      expect(field(form, question)).toHaveValue('');
    }
  });

  it('prefills the form with the existing check-in', async () => {
    renderMeeting({
      checkins: [checkinFixture({ userId: STUDENT_ID, did: 'Hice el login', blockers: 'Nada' })],
    });

    const form = await ownForm();
    expect(field(form, '¿Qué hice?')).toHaveValue('Hice el login');
    expect(field(form, '¿Qué me bloquea?')).toHaveValue('Nada');
    expect(field(form, '¿Qué voy a hacer?')).toHaveValue('');
  });

  it('saves all four texts with a client id and announces it', async () => {
    const { fetchMock } = renderMeeting({
      handlers: {
        [`PUT /meetings/${MEETING_ID}/checkins/me`]: () =>
          jsonResponse(201, checkinFixture({ userId: STUDENT_ID, did: 'Hice el login', updatedAt: NEW_STAMP })),
      },
    });

    const form = await ownForm();
    type(form, '¿Qué hice?', '  Hice el login ');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));

    expect(await screen.findByText('Check-in guardado.')).toHaveAttribute('role', 'status');
    const [body] = bodiesOf(fetchMock, 'PUT', `/meetings/${MEETING_ID}/checkins/me`);
    expect(body).toEqual({
      id: expect.stringMatching(/^[a-z][a-z0-9]{10,}$/),
      did: 'Hice el login',
      doing: '',
      willDo: '',
      blockers: '',
    });
  });

  it('sends the other three texts too when only one changed, with the version it started from', async () => {
    const saved = checkinFixture({ userId: STUDENT_ID, did: 'A', doing: 'B', willDo: 'C', blockers: 'D' });
    const { fetchMock } = renderMeeting({
      checkins: [saved],
      handlers: {
        [`PUT /meetings/${MEETING_ID}/checkins/me`]: () => jsonResponse(200, { ...saved, blockers: 'E', updatedAt: NEW_STAMP }),
      },
    });

    const form = await ownForm();
    type(form, '¿Qué me bloquea?', 'E');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));

    await screen.findByText('Check-in guardado.');
    expect(bodiesOf(fetchMock, 'PUT', `/meetings/${MEETING_ID}/checkins/me`)[0]).toEqual({
      id: saved.id,
      did: 'A',
      doing: 'B',
      willDo: 'C',
      blockers: 'E',
      expectedUpdatedAt: saved.updatedAt,
    });
  });

  it('reuses the same id when a failed save is retried', async () => {
    let attempts = 0;
    const { fetchMock } = renderMeeting({
      handlers: {
        [`PUT /meetings/${MEETING_ID}/checkins/me`]: () => {
          attempts += 1;
          if (attempts === 1) throw new TypeError('Failed to fetch');
          return jsonResponse(201, checkinFixture({ userId: STUDENT_ID, doing: 'Algo' }));
        },
      },
    });

    const form = await ownForm();
    type(form, '¿Qué estoy haciendo?', 'Algo');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));
    await screen.findByText('Check-in guardado.');

    const [first, second] = bodiesOf(fetchMock, 'PUT', `/meetings/${MEETING_ID}/checkins/me`);
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBe(first?.id);
  });

  it('explains a conflict, reloads the fresh check-in and retries on it', async () => {
    let server = checkinFixture({ userId: STUDENT_ID, did: 'Versión vieja' });
    const { fetchMock } = renderMeeting({
      checkins: [server],
      handlers: {
        [`GET /meetings/${MEETING_ID}`]: () => jsonResponse(200, meetingDetailFixture({ checkins: [server] })),
        [`PUT /meetings/${MEETING_ID}/checkins/me`]: () => {
          if (server.updatedAt !== NEW_STAMP) {
            server = { ...server, did: 'Lo capturó el moderador', updatedAt: NEW_STAMP, capturedById: MODERATOR_ID };
            return errorResponse(409, 'CHECKIN_CONFLICT');
          }
          return jsonResponse(200, server);
        },
      },
    });

    const form = await ownForm();
    type(form, '¿Qué me bloquea?', 'Mi bloqueo');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('El check-in cambió mientras lo editabas');
    await waitFor(() => expect(field(form, '¿Qué hice?')).toHaveValue('Lo capturó el moderador'));
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));

    await screen.findByText('Check-in guardado.');
    const bodies = bodiesOf(fetchMock, 'PUT', `/meetings/${MEETING_ID}/checkins/me`);
    expect(bodies[1]).toMatchObject({ did: 'Lo capturó el moderador', expectedUpdatedAt: NEW_STAMP });
  });

  it('rejects a text over the limit before sending', async () => {
    const { fetchMock } = renderMeeting();

    const form = await ownForm();
    type(form, '¿Qué voy a hacer?', 'x'.repeat(CHECKIN_TEXT_MAX_LENGTH + 1));
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar check-in' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(`como máximo ${CHECKIN_TEXT_MAX_LENGTH} caracteres`);
    expect(field(form, '¿Qué voy a hacer?')).toHaveAttribute('aria-invalid', 'true');
    expect(bodiesOf(fetchMock, 'PUT', `/meetings/${MEETING_ID}/checkins/me`)).toHaveLength(0);
  });

  it('is available after the meeting ended', async () => {
    renderMeeting({
      meeting: meetingFixture({
        startedAt: '2026-10-19T15:00:00.000Z',
        endedAt: '2026-10-19T15:10:00.000Z',
        durationSeconds: 600,
      }),
    });

    expect(await ownForm()).toBeInTheDocument();
  });

  it('is disabled while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderMeeting();

    const form = await ownForm();
    expect(field(form, '¿Qué hice?')).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Guardar check-in' })).toBeDisabled();
  });

  it('is not offered to the teacher, who only reads', async () => {
    renderMeeting({ viewer: 'teacher' });

    await screen.findByRole('heading', { name: 'Check-ins del equipo' });
    expect(screen.queryByRole('form', { name: 'Mi check-in' })).not.toBeInTheDocument();
  });

  it('is offered to the moderator as a member too', async () => {
    renderMeeting({ viewer: 'moderator' });

    expect(await ownForm()).toBeInTheDocument();
  });
});

describe('team check-ins', () => {
  it('lists every member in row order with their four answers', async () => {
    renderMeeting({
      checkins: [
        checkinFixture({ userId: OTHER_ID, did: 'Hice el logo', doing: 'Estilos', willDo: 'Pruebas', blockers: 'Sin internet' }),
      ],
    });

    const carla = await listItem('Carla Díaz');
    expect(within(carla).getByText('¿Qué hice?')).toBeInTheDocument();
    expect(within(carla).getByText('Hice el logo')).toBeInTheDocument();
    expect(within(carla).getByText('Estilos')).toBeInTheDocument();
    expect(within(carla).getByText('Pruebas')).toBeInTheDocument();
    expect(within(carla).getByText('Sin internet')).toBeInTheDocument();
    const names = within(screen.getByRole('list', { name: 'Check-ins' })).getAllByRole('heading').map((h) => h.textContent);
    expect(names).toEqual(['Ana López', 'Luis Alumno', 'Carla Díaz']);
  });

  it('marks members without a check-in', async () => {
    renderMeeting({ checkins: [checkinFixture({ userId: OTHER_ID, did: 'x' })] });

    expect(await listItem('Ana López')).toHaveTextContent('Sin check-in');
    expect(await listItem('Carla Díaz')).not.toHaveTextContent('Sin check-in');
  });

  it('shows who captured a check-in for the member', async () => {
    renderMeeting({
      checkins: [
        checkinFixture({ userId: OTHER_ID, did: 'x', capturedById: MODERATOR_ID }),
        checkinFixture({ userId: STUDENT_ID, did: 'y' }),
      ],
    });

    expect(await listItem('Carla Díaz')).toHaveTextContent('Capturado por Ana López');
    expect(await listItem('Luis Alumno')).not.toHaveTextContent('Capturado por');
  });
});

describe('moderator capture', () => {
  const captureForm = () => screen.findByRole('form', { name: 'Capturar check-in' });
  const pick = (name: string) =>
    fireEvent.change(screen.getByLabelText('Integrante'), {
      target: { value: { 'Luis Alumno': STUDENT_ID, 'Carla Díaz': OTHER_ID }[name] },
    });

  it('is only for the moderator', async () => {
    renderMeeting({ viewer: 'member' });
    await ownForm();
    expect(screen.queryByLabelText('Integrante')).not.toBeInTheDocument();
  });

  it('is not offered to the teacher', async () => {
    renderMeeting({ viewer: 'teacher' });
    await screen.findByRole('heading', { name: 'Check-ins del equipo' });
    expect(screen.queryByLabelText('Integrante')).not.toBeInTheDocument();
  });

  it('offers the teammates but not the moderator themself', async () => {
    renderMeeting({ viewer: 'moderator' });

    await ownForm();
    const options = within(screen.getByLabelText('Integrante')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Elige un integrante', 'Luis Alumno', 'Carla Díaz']);
  });

  it('captures a check-in for a member who has none, sending only the filled fields', async () => {
    const { fetchMock } = renderMeeting({
      viewer: 'moderator',
      handlers: {
        [`PATCH /meetings/${MEETING_ID}/checkins/${OTHER_ID}`]: () =>
          jsonResponse(201, checkinFixture({ userId: OTHER_ID, doing: 'Estilos', capturedById: MODERATOR_ID })),
      },
    });

    await ownForm();
    pick('Carla Díaz');
    const form = await captureForm();
    type(form, '¿Qué estoy haciendo?', ' Estilos ');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar captura' }));

    expect(await screen.findByText('Check-in de Carla Díaz guardado.')).toHaveAttribute('role', 'status');
    expect(bodiesOf(fetchMock, 'PATCH', `/meetings/${MEETING_ID}/checkins/${OTHER_ID}`)).toEqual([{ doing: 'Estilos' }]);
  });

  it('prefills an existing check-in and sends only the changed field with its version', async () => {
    const saved = checkinFixture({ userId: STUDENT_ID, did: 'A', doing: 'B' });
    const { fetchMock } = renderMeeting({
      viewer: 'moderator',
      checkins: [saved],
      handlers: {
        [`PATCH /meetings/${MEETING_ID}/checkins/${STUDENT_ID}`]: () =>
          jsonResponse(200, { ...saved, blockers: 'Sin laptop', capturedById: MODERATOR_ID, updatedAt: NEW_STAMP }),
      },
    });

    await ownForm();
    pick('Luis Alumno');
    const form = await captureForm();
    expect(field(form, '¿Qué hice?')).toHaveValue('A');
    type(form, '¿Qué me bloquea?', 'Sin laptop');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar captura' }));

    await screen.findByText('Check-in de Luis Alumno guardado.');
    expect(bodiesOf(fetchMock, 'PATCH', `/meetings/${MEETING_ID}/checkins/${STUDENT_ID}`)).toEqual([
      { blockers: 'Sin laptop', expectedUpdatedAt: saved.updatedAt },
    ]);
  });

  it('asks for a change before sending anything', async () => {
    const { fetchMock } = renderMeeting({ viewer: 'moderator' });

    await ownForm();
    pick('Carla Díaz');
    const form = await captureForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar captura' }));

    expect(within(form).getByRole('alert')).toHaveTextContent('No hay cambios que guardar.');
    expect(bodiesOf(fetchMock, 'PATCH', `/meetings/${MEETING_ID}/checkins/${OTHER_ID}`)).toHaveLength(0);
  });

  it('explains a conflict on the captured check-in', async () => {
    renderMeeting({
      viewer: 'moderator',
      checkins: [checkinFixture({ userId: STUDENT_ID, did: 'A' })],
      handlers: {
        [`PATCH /meetings/${MEETING_ID}/checkins/${STUDENT_ID}`]: () => errorResponse(409, 'CHECKIN_CONFLICT'),
      },
    });

    await ownForm();
    pick('Luis Alumno');
    const form = await captureForm();
    type(form, '¿Qué hice?', 'B');
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar captura' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('El check-in cambió mientras lo editabas');
  });

  it('is disabled while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderMeeting({ viewer: 'moderator' });

    await ownForm();
    expect(screen.getByLabelText('Integrante')).toBeDisabled();
  });
});
