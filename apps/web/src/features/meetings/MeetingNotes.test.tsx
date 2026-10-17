import { MEETING_TEXT_MAX_LENGTH, type MeetingResponse } from '@kanbit/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RouteObject } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

const NEW_STAMP = '2026-10-19T16:00:00.000Z';

/** The server side of one meeting: GETs read `current`; `onPatch` and `onStart` decide the writes. */
function renderMeeting(
  viewer: MeetingViewer,
  initial: MeetingResponse = meetingFixture(),
  writes: { onPatch?: (current: MeetingResponse, body: Record<string, unknown>) => Response; startStamp?: string } = {},
) {
  let current = initial;
  const fetchMock = mockMeetingApi({
    viewer,
    handlers: {
      'GET /teams/t1/meetings/today': () => jsonResponse(200, todayFixture({ meeting: current })),
      'GET /meetings/m1': () => jsonResponse(200, meetingDetailFixture(current)),
      'PATCH /meetings/m1': (init) => {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (writes.onPatch) return writes.onPatch(current, body);
        current = { ...current, ...body, updatedAt: NEW_STAMP } as MeetingResponse;
        return jsonResponse(200, current);
      },
      'POST /meetings/m1/start': () => {
        current = { ...current, startedAt: '2026-10-19T15:30:00.000Z', updatedAt: writes.startStamp ?? current.updatedAt };
        return jsonResponse(200, current);
      },
    },
  });
  return {
    fetchMock,
    setCurrent: (next: MeetingResponse) => {
      current = next;
    },
    ...renderRoutes(routes, ['/meeting']),
  };
}

const notesForm = () => screen.findByRole('form', { name: 'Notas y acuerdos' });
const patchBodies = (fetchMock: ReturnType<typeof mockMeetingApi>) =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url) === '/api/v1/meetings/m1' && init?.method === 'PATCH')
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);

describe('notes and agreements', () => {
  it.each(['moderator', 'teacher'] as const)('lets the %s edit them, prefilled', async (viewer) => {
    renderMeeting(viewer, meetingFixture({ notesMd: 'Se revisó el tablero', agreements: 'Terminar el login' }));

    const form = await notesForm();
    expect(within(form).getByLabelText('Notas')).toHaveValue('Se revisó el tablero');
    expect(within(form).getByLabelText('Acuerdos')).toHaveValue('Terminar el login');
  });

  it('shows a plain member the text read-only, as plain text', async () => {
    renderMeeting('member', meetingFixture({ notesMd: '**negrita** <b>x</b>', agreements: null }));

    expect(await screen.findByRole('heading', { name: 'Notas y acuerdos' })).toBeInTheDocument();
    expect(screen.getByText('**negrita** <b>x</b>')).toBeInTheDocument();
    expect(screen.getByText('Sin acuerdos.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Notas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument();
  });

  it('saves only the changed field with the version it started from', async () => {
    const { fetchMock } = renderMeeting('moderator', meetingFixture({ notesMd: 'Antes', agreements: 'Igual' }));

    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Notas'), { target: { value: 'Después' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Notas y acuerdos guardados.')).toHaveAttribute('role', 'status');
    expect(patchBodies(fetchMock)).toEqual([{ notesMd: 'Después', expectedUpdatedAt: meetingFixture().updatedAt }]);
  });

  it('clears a text by sending it empty', async () => {
    const { fetchMock } = renderMeeting('teacher', meetingFixture({ agreements: 'Algo' }));

    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Acuerdos'), { target: { value: '' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Notas y acuerdos guardados.');
    expect(patchBodies(fetchMock)[0]).toMatchObject({ agreements: '' });
  });

  it('asks for a change before sending anything', async () => {
    const { fetchMock } = renderMeeting('moderator');

    const form = await notesForm();
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(within(form).getByRole('alert')).toHaveTextContent('No hay cambios que guardar.');
    expect(patchBodies(fetchMock)).toHaveLength(0);
  });

  it('rejects text over the limit before sending', async () => {
    const { fetchMock } = renderMeeting('moderator');

    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Acuerdos'), { target: { value: 'x'.repeat(MEETING_TEXT_MAX_LENGTH + 1) } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(within(form).getByRole('alert')).toHaveTextContent(`como máximo ${MEETING_TEXT_MAX_LENGTH} caracteres`);
    expect(patchBodies(fetchMock)).toHaveLength(0);
  });

  it('explains a conflict in Spanish', async () => {
    const { fetchMock } = renderMeeting('moderator', meetingFixture({ notesMd: 'Mía' }), {
      onPatch: () => errorResponse(409, 'MEETING_CONFLICT'),
    });
    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Acuerdos'), { target: { value: 'Mi acuerdo' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent('La reunión cambió mientras la editabas');
    expect(patchBodies(fetchMock)).toHaveLength(1);
  });

  it('re-bases on the reloaded meeting after a conflict', async () => {
    const holder: { setCurrent?: (next: MeetingResponse) => void } = {};
    const { fetchMock, setCurrent } = renderMeeting('moderator', meetingFixture({ notesMd: 'Mía' }), {
      onPatch: (current, body) => {
        if (body.expectedUpdatedAt !== NEW_STAMP) {
          holder.setCurrent?.({ ...current, notesMd: 'Del docente', updatedAt: NEW_STAMP });
          return errorResponse(409, 'MEETING_CONFLICT');
        }
        return jsonResponse(200, { ...current, ...body, updatedAt: '2026-10-19T17:00:00.000Z' });
      },
    });
    holder.setCurrent = setCurrent;

    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Acuerdos'), { target: { value: 'Mi acuerdo' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));
    await within(form).findByRole('alert');
    await waitFor(() => expect(within(form).getByLabelText('Notas')).toHaveValue('Del docente'));

    fireEvent.change(within(form).getByLabelText('Acuerdos'), { target: { value: 'Otro acuerdo' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Notas y acuerdos guardados.');
    expect(patchBodies(fetchMock)[1]).toEqual({ agreements: 'Otro acuerdo', expectedUpdatedAt: NEW_STAMP });
  });

  it('keeps editing against the new version after starting the meeting, which changes updatedAt', async () => {
    const { fetchMock } = renderMeeting('moderator', meetingFixture(), { startStamp: NEW_STAMP });

    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar reunión' }));
    await screen.findByText('Estado: En curso');
    const form = await notesForm();
    fireEvent.change(within(form).getByLabelText('Notas'), { target: { value: 'Ya empezamos' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Guardar' }));

    await screen.findByText('Notas y acuerdos guardados.');
    expect(patchBodies(fetchMock)[0]).toEqual({ notesMd: 'Ya empezamos', expectedUpdatedAt: NEW_STAMP });
  });

  it('can still be edited after the meeting ended', async () => {
    renderMeeting(
      'moderator',
      meetingFixture({ startedAt: '2026-10-19T15:00:00.000Z', endedAt: '2026-10-19T15:10:00.000Z', durationSeconds: 600 }),
    );

    expect(await notesForm()).toBeInTheDocument();
  });

  it('is disabled while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderMeeting('moderator');

    const form = await notesForm();
    expect(within(form).getByLabelText('Notas')).toBeDisabled();
    expect(within(form).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });
});
