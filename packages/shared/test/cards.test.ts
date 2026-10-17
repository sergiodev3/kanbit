import { describe, expect, it } from 'vitest';
import {
  BoardResponse,
  CARD_TITLE_MAX_LENGTH,
  CardResponse,
  CreateCardRequest,
  DONE_CRITERIA_MAX_LENGTH,
  MoveCardRequest,
  UpdateCardRequest,
} from '../src/index';

const id = 'tz4a98xxat96iws9zmbrgj3a';
const projectId = 'pz4a98xxat96iws9zmbrgj3b';

describe('CreateCardRequest', () => {
  it('requires a client cuid2 id, a project and a trimmed title', () => {
    expect(CreateCardRequest.parse({ id, projectId, title: '  Login form ' })).toEqual({
      id,
      projectId,
      title: 'Login form',
    });
    expect(CreateCardRequest.safeParse({ id: 'Not-A-Cuid!', projectId, title: 'x' }).success).toBe(false);
    expect(CreateCardRequest.safeParse({ id, projectId, title: '   ' }).success).toBe(false);
    expect(CreateCardRequest.safeParse({ projectId, title: 'x' }).success).toBe(false);
  });

  it('enforces the title and done-criteria limits (spec §6.1)', () => {
    const parse = (data: object) => CreateCardRequest.safeParse({ id, projectId, title: 'x', ...data }).success;
    expect(parse({ title: 'a'.repeat(CARD_TITLE_MAX_LENGTH) })).toBe(true);
    expect(parse({ title: 'a'.repeat(CARD_TITLE_MAX_LENGTH + 1) })).toBe(false);
    expect(parse({ doneCriteria: 'a'.repeat(DONE_CRITERIA_MAX_LENGTH) })).toBe(true);
    expect(parse({ doneCriteria: 'a'.repeat(DONE_CRITERIA_MAX_LENGTH + 1) })).toBe(false);
    expect(CARD_TITLE_MAX_LENGTH).toBe(140);
    expect(DONE_CRITERIA_MAX_LENGTH).toBe(200);
  });

  it('accepts optional done criteria and due weekday, treating blank criteria as none', () => {
    expect(CreateCardRequest.parse({ id, projectId, title: 'x', doneCriteria: ' Demo ', dueWeekday: 'WED' })).toEqual(
      { id, projectId, title: 'x', doneCriteria: 'Demo', dueWeekday: 'WED' },
    );
    expect(CreateCardRequest.parse({ id, projectId, title: 'x', doneCriteria: '  ' }).doneCriteria).toBeNull();
    expect(CreateCardRequest.safeParse({ id, projectId, title: 'x', dueWeekday: 'SAT' }).success).toBe(false);
  });
});

describe('UpdateCardRequest', () => {
  it('needs at least one editable field', () => {
    expect(UpdateCardRequest.safeParse({}).success).toBe(false);
    expect(UpdateCardRequest.safeParse({ expectedUpdatedAt: '2026-10-19T15:00:00.000Z' }).success).toBe(false);
    expect(UpdateCardRequest.parse({ title: ' New ' })).toEqual({ title: 'New' });
  });

  it('lets done criteria and due weekday be cleared with null (or blank criteria)', () => {
    expect(UpdateCardRequest.parse({ doneCriteria: null, dueWeekday: null })).toEqual({
      doneCriteria: null,
      dueWeekday: null,
    });
    expect(UpdateCardRequest.parse({ doneCriteria: '' })).toEqual({ doneCriteria: null });
  });

  it('accepts an ISO expectedUpdatedAt and rejects anything else', () => {
    const ok = UpdateCardRequest.safeParse({ projectId, expectedUpdatedAt: '2026-10-19T15:00:00.000Z' });
    expect(ok.success).toBe(true);
    expect(UpdateCardRequest.safeParse({ projectId, expectedUpdatedAt: 'yesterday' }).success).toBe(false);
  });
});

describe('MoveCardRequest', () => {
  it('requires status, assignee (nullable) and a position string', () => {
    expect(MoveCardRequest.parse({ status: 'TODO', assigneeId: id, position: 'a0', dueWeekday: 'MON' })).toEqual({
      status: 'TODO',
      assigneeId: id,
      position: 'a0',
      dueWeekday: 'MON',
    });
    expect(MoveCardRequest.safeParse({ status: 'BACKLOG', assigneeId: null, position: 'a0' }).success).toBe(true);
    expect(MoveCardRequest.safeParse({ status: 'BACKLOG', position: 'a0' }).success).toBe(false);
    // The format is checked by the API so a malformed key gets its own error code (400 INVALID_POSITION).
    expect(MoveCardRequest.safeParse({ status: 'TODO', assigneeId: id, position: 'a00' }).success).toBe(true);
    expect(MoveCardRequest.safeParse({ status: 'TODO', assigneeId: id }).success).toBe(false);
    expect(MoveCardRequest.safeParse({ status: 'LATER', assigneeId: id, position: 'a0' }).success).toBe(false);
  });
});

describe('BoardResponse', () => {
  const card = {
    id,
    teamId: 'team1',
    projectId,
    sprintId: null,
    assigneeId: null,
    title: 'Login form',
    doneCriteria: null,
    dueWeekday: null,
    status: 'BACKLOG',
    position: 'a0',
    validated: false,
    validatedById: null,
    carriedOverCount: 0,
    completedAt: null,
    createdById: 'user1',
    createdAt: '2026-10-19T15:00:00.000Z',
    updatedAt: '2026-10-19T15:00:00.000Z',
  };

  it('describes a card', () => {
    expect(CardResponse.parse(card)).toEqual(card);
    expect(CardResponse.safeParse({ ...card, status: 'LATER' }).success).toBe(false);
  });

  it('describes the board: team, member rows, nullable sprint, projects and cards', () => {
    const board = {
      team: { id: 'team1', name: 'Los Bits', groupId: 'group1', moderatorId: 'user1' },
      members: [{ userId: 'user1', name: 'Ana', username: 'ana', isModerator: true, rowOrder: 0 }],
      sprint: null,
      projects: [{ id: projectId, teamId: 'team1', name: 'Kanbit', updatedAt: '2026-10-19T15:00:00.000Z' }],
      cards: [card],
    };
    expect(BoardResponse.parse(board)).toEqual(board);

    const sprint = {
      id: 'sprint1',
      number: 1,
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      goal: null,
      status: 'OPEN',
      updatedAt: '2026-10-19T15:00:00.000Z',
    };
    expect(BoardResponse.parse({ ...board, sprint }).sprint).toEqual(sprint);
    expect(BoardResponse.safeParse({ ...board, sprint: { ...sprint, startDate: '19/10/2026' } }).success).toBe(false);
  });
});
