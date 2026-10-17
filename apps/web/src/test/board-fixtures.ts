import type { BoardResponse, CardResponse } from '@kanbit/shared';

const STAMP = '2026-10-16T15:00:00.000Z';

/** Viewer ids: `student-1` matches `meFixture('STUDENT')`; `mod1` is the team moderator. */
export const STUDENT_ID = 'student-1';
export const MODERATOR_ID = 'mod1';
export const OTHER_ID = 'u3';

export function cardFixture(overrides: Partial<CardResponse> & Pick<CardResponse, 'id'>): CardResponse {
  return {
    teamId: 't1',
    projectId: 'p1',
    sprintId: null,
    assigneeId: null,
    title: `Tarea ${overrides.id}`,
    doneCriteria: null,
    dueWeekday: null,
    status: 'BACKLOG',
    position: 'a0',
    validated: false,
    validatedById: null,
    carriedOverCount: 0,
    completedAt: null,
    createdById: STUDENT_ID,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

/** Members are listed out of `rowOrder` on purpose; the board must sort them. */
export function boardFixture(overrides: Partial<BoardResponse> = {}): BoardResponse {
  return {
    team: { id: 't1', name: 'Equipo Rojo', groupId: 'g1', moderatorId: MODERATOR_ID },
    today: { date: '2026-10-16', weekday: 'FRI' },
    members: [
      { userId: STUDENT_ID, name: 'Luis Alumno', username: 'a001', isModerator: false, rowOrder: 1 },
      { userId: MODERATOR_ID, name: 'Ana López', username: 'a000', isModerator: true, rowOrder: 0 },
      { userId: OTHER_ID, name: 'Carla Díaz', username: 'a003', isModerator: false, rowOrder: 2 },
    ],
    sprint: null,
    projects: [
      { id: 'p1', teamId: 't1', name: 'App de tareas', updatedAt: STAMP },
      { id: 'p2', teamId: 't1', name: 'Portafolio', updatedAt: STAMP },
    ],
    cards: [
      cardFixture({ id: 'cfree1', title: 'Diseñar logo', position: 'a1' }),
      cardFixture({ id: 'cfree2', title: 'Escribir README', position: 'a0' }),
      cardFixture({ id: 'cmineb', title: 'Pruebas de API', assigneeId: STUDENT_ID }),
      cardFixture({
        id: 'cmine',
        title: 'Login con JWT',
        status: 'TODO',
        assigneeId: STUDENT_ID,
        doneCriteria: 'El usuario inicia sesión',
        dueWeekday: 'TUE',
      }),
      cardFixture({
        id: 'cmod',
        title: 'Pantalla de tablero',
        status: 'DOING',
        assigneeId: MODERATOR_ID,
        projectId: 'p2',
        doneCriteria: 'Se ve el tablero',
        dueWeekday: 'WED',
      }),
      cardFixture({
        id: 'cother',
        title: 'Estilos del login',
        status: 'TODO',
        assigneeId: OTHER_ID,
        doneCriteria: 'Pasa revisión',
        dueWeekday: 'THU',
      }),
    ],
    ...overrides,
  };
}
