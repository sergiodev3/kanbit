import { describe, expect, it } from 'vitest';
import type { CardRecord } from '../src/modules/cards/cards.service';
import { planClose, planSprintStart } from '../src/modules/sprints/sprint.rules';

const CREATED = new Date('2026-10-19T15:00:00Z');
const week = { monday: '2026-10-19', friday: '2026-10-23' };

const card = (overrides: Partial<CardRecord>): CardRecord => ({
  id: 'card1',
  teamId: 'team1',
  projectId: 'project1',
  sprintId: 'sprint1',
  assigneeId: 'beto',
  title: 'Card',
  doneCriteria: 'Demo',
  dueWeekday: 'WED',
  status: 'TODO',
  position: 'a0',
  validated: true,
  validatedById: 'ana',
  carriedOverCount: 0,
  completedAt: null,
  createdById: 'ana',
  createdAt: CREATED,
  updatedAt: CREATED,
  ...overrides,
});

describe('planSprintStart', () => {
  it('numbers the first sprint 1 and spans the given Monday–Friday', () => {
    expect(planSprintStart(null, week, 'Login listo')).toEqual({
      number: 1,
      startDate: '2026-10-19',
      endDate: '2026-10-23',
      goal: 'Login listo',
    });
  });

  it('numbers later sprints after the highest existing one', () => {
    expect(planSprintStart(4, week, 'Tablero').number).toBe(5);
  });
});

describe('planClose', () => {
  const noBacklog = new Map<string | null, readonly string[]>();

  it('sends unfinished cards back to the backlog keeping the assignee, clearing sprint and validation', () => {
    const plan = planClose([card({ id: 'todo', status: 'TODO' })], noBacklog);

    expect(plan.changes).toEqual([
      {
        cardId: 'todo',
        version: CREATED,
        changes: { status: 'BACKLOG', sprintId: null, validated: false, validatedById: null, position: 'a0' },
      },
    ]);
    expect(plan.events).toEqual([{ cardId: 'todo', type: 'MOVED', fromStatus: 'TODO', toStatus: 'BACKLOG' }]);
  });

  it('leaves DONE cards in the sprint', () => {
    const plan = planClose([card({ id: 'done', status: 'DONE', completedAt: CREATED })], noBacklog);

    expect(plan).toEqual({ changes: [], events: [] });
  });

  it("appends after the last card of each assignee's backlog cell, in board order", () => {
    const backlog = new Map<string | null, readonly string[]>([
      ['beto', ['a0', 'a3', 'Zz']],
      ['carla', []],
    ]);
    const cards = [
      card({ id: 'betoDoing', status: 'DOING', position: 'a0' }),
      card({ id: 'betoTodo2', status: 'TODO', position: 'a1' }),
      // 'Zz' < 'a0' bytewise: this TODO card comes first.
      card({ id: 'betoTodo1', status: 'TODO', position: 'Zz' }),
      card({ id: 'carlaTodo', assigneeId: 'carla', status: 'TODO', position: 'a7' }),
      card({ id: 'betoDone', status: 'DONE', position: 'a0' }),
    ];

    const plan = planClose(cards, backlog);

    expect(plan.changes.map(({ cardId, changes }) => [cardId, changes.position])).toEqual([
      ['betoTodo1', 'a4'],
      ['betoTodo2', 'a5'],
      ['carlaTodo', 'a0'],
      ['betoDoing', 'a6'],
    ]);
    expect(plan.events.map((event) => [event.cardId, event.fromStatus])).toEqual([
      ['betoTodo1', 'TODO'],
      ['betoTodo2', 'TODO'],
      ['carlaTodo', 'TODO'],
      ['betoDoing', 'DOING'],
    ]);
  });
});
