import { describe, expect, it } from 'vitest';
import { AppError } from '../src/http/errors';
import { type MoveTarget, planMove } from '../src/modules/cards/card.rules';
import type { CardRecord } from '../src/modules/cards/cards.service';

const CREATED = new Date('2026-10-19T15:00:00Z');
const NOW = new Date('2026-10-20T16:00:00Z');
const context = { now: NOW, memberIds: ['ana', 'beto'] };

const card = (overrides: Partial<CardRecord> = {}): CardRecord => ({
  id: 'card1',
  teamId: 'team1',
  projectId: 'project1',
  sprintId: null,
  assigneeId: null,
  title: 'Card',
  doneCriteria: null,
  dueWeekday: null,
  status: 'BACKLOG',
  position: 'a0',
  validated: false,
  validatedById: null,
  carriedOverCount: 0,
  completedAt: null,
  createdById: 'ana',
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

const ready = (overrides: Partial<CardRecord> = {}) =>
  card({ assigneeId: 'beto', doneCriteria: 'Demo en clase', dueWeekday: 'WED', ...overrides });

/** Runs `fn` and returns the AppError it throws (status + code). */
function failure(fn: () => unknown): { status: number; code: string } {
  try {
    fn();
  } catch (err) {
    if (err instanceof AppError) return { status: err.status, code: err.code };
    throw err;
  }
  throw new Error('expected an AppError');
}

describe('planMove', () => {
  it('takes a complete backlog card into a member row, recording MOVED', () => {
    const target: MoveTarget = { status: 'TODO', assigneeId: 'beto', position: 'a1' };

    expect(planMove(ready(), target, context)).toEqual({
      changes: {
        status: 'TODO',
        assigneeId: 'beto',
        position: 'a1',
        doneCriteria: 'Demo en clase',
        dueWeekday: 'WED',
        sprintId: null,
        validated: false,
        validatedById: null,
        completedAt: null,
      },
      events: [{ type: 'MOVED', fromStatus: 'BACKLOG', toStatus: 'TODO' }],
    });
  });

  it('claims an unassigned card with details from the request, recording MOVED then ASSIGNED', () => {
    const target: MoveTarget = {
      status: 'TODO',
      assigneeId: 'ana',
      position: 'a0',
      dueWeekday: 'FRI',
      doneCriteria: 'Probado en el celular',
    };

    const plan = planMove(card(), target, context);

    expect(plan.changes).toMatchObject({ assigneeId: 'ana', dueWeekday: 'FRI', doneCriteria: 'Probado en el celular' });
    expect(plan.events).toEqual([
      { type: 'MOVED', fromStatus: 'BACKLOG', toStatus: 'TODO' },
      { type: 'ASSIGNED', fromStatus: null, toStatus: null },
    ]);
  });

  it('records only ASSIGNED when the row changes but the column does not', () => {
    const plan = planMove(ready({ status: 'DOING' }), { status: 'DOING', assigneeId: 'ana', position: 'a0' }, context);

    expect(plan.events).toEqual([{ type: 'ASSIGNED', fromStatus: null, toStatus: null }]);
  });

  it('writes no event for a pure reorder within the same cell', () => {
    const plan = planMove(ready({ status: 'TODO' }), { status: 'TODO', assigneeId: 'beto', position: 'Zz' }, context);

    expect(plan.changes.position).toBe('Zz');
    expect(plan.events).toEqual([]);
  });

  it.each([
    ['no assignee', card({ doneCriteria: 'x', dueWeekday: 'MON' }), { assigneeId: null }],
    ['no done criteria', card({ dueWeekday: 'MON' }), { assigneeId: 'beto' }],
    ['no due weekday', card({ doneCriteria: 'x' }), { assigneeId: 'beto' }],
  ] as const)('refuses to leave the backlog with %s (400 CARD_INCOMPLETE)', (_case, source, target) => {
    for (const status of ['TODO', 'DOING', 'DONE'] as const) {
      expect(failure(() => planMove(source, { status, position: 'a1', ...target }, context))).toEqual({
        status: 400,
        code: 'CARD_INCOMPLETE',
      });
    }
  });

  it('refuses an assignee who is not a team member (400 NOT_A_TEAM_MEMBER), even in the backlog', () => {
    const notMember = { status: 400, code: 'NOT_A_TEAM_MEMBER' };
    const toCarla = (status: 'BACKLOG' | 'TODO') => ({ status, assigneeId: 'carla', position: 'a1' });

    expect(failure(() => planMove(ready(), toCarla('TODO'), context))).toEqual(notMember);
    expect(failure(() => planMove(card(), toCarla('BACKLOG'), context))).toEqual(notMember);
  });

  it.each(['', 'a00', 'a-1', 'b'])('refuses the malformed position %j (400 INVALID_POSITION)', (position) => {
    expect(failure(() => planMove(ready(), { status: 'TODO', assigneeId: 'beto', position }, context))).toEqual({
      status: 400,
      code: 'INVALID_POSITION',
    });
  });

  it('back to the backlog clears sprint and validation, keeping or dropping the assignee', () => {
    const inSprint = ready({ status: 'TODO', sprintId: 'sprint1', validated: true, validatedById: 'ana' });

    const kept = planMove(inSprint, { status: 'BACKLOG', assigneeId: 'beto', position: 'a0' }, context);
    const dropped = planMove(inSprint, { status: 'BACKLOG', assigneeId: null, position: 'a0' }, context);

    expect(kept.changes).toMatchObject({ assigneeId: 'beto', sprintId: null, validated: false, validatedById: null });
    expect(kept.events).toEqual([{ type: 'MOVED', fromStatus: 'TODO', toStatus: 'BACKLOG' }]);
    expect(dropped.changes).toMatchObject({ assigneeId: null, sprintId: null, validated: false });
    expect(dropped.events).toEqual([
      { type: 'MOVED', fromStatus: 'TODO', toStatus: 'BACKLOG' },
      { type: 'ASSIGNED', fromStatus: null, toStatus: null },
    ]);
  });

  it('keeps the sprint and validation while moving between sprint columns', () => {
    const inSprint = ready({ status: 'TODO', sprintId: 'sprint1', validated: true, validatedById: 'ana' });

    const plan = planMove(inSprint, { status: 'DOING', assigneeId: 'beto', position: 'a0' }, context);

    expect(plan.changes).toMatchObject({ sprintId: 'sprint1', validated: true, validatedById: 'ana' });
  });

  it('stamps completedAt entering DONE, keeps it while reordering in DONE and clears it leaving DONE', () => {
    const doing = ready({ status: 'DOING' });
    const done = ready({ status: 'DONE', completedAt: CREATED });

    const completedAt = (source: CardRecord, status: MoveTarget['status'], position = 'a0') =>
      planMove(source, { status, assigneeId: 'beto', position }, context).changes.completedAt;

    expect(completedAt(doing, 'DONE')).toEqual(NOW);
    expect(completedAt(done, 'DONE', 'a5')).toEqual(CREATED);
    expect(completedAt(done, 'DOING')).toBeNull();
    expect(completedAt(done, 'BACKLOG')).toBeNull();
  });
});
