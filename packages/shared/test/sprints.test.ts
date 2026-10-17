import { describe, expect, it } from 'vitest';
import {
  CloseSprintResponse,
  SPRINT_GOAL_MAX_LENGTH,
  SprintGoal,
  SprintResponse,
  StartSprintRequest,
} from '../src/index';

const sprint = {
  id: 'sz4a98xxat96iws9zmbrgj3a',
  teamId: 'tz4a98xxat96iws9zmbrgj3b',
  number: 1,
  startDate: '2026-10-19',
  endDate: '2026-10-23',
  goal: 'Login listo',
  status: 'OPEN',
  updatedAt: '2026-10-19T15:00:00.000Z',
};

describe('SprintGoal', () => {
  it('trims and requires 1..200 characters', () => {
    expect(SprintGoal.parse('  Login listo ')).toBe('Login listo');
    expect(SprintGoal.safeParse('   ').success).toBe(false);
    expect(SprintGoal.safeParse('a'.repeat(200)).success).toBe(true);
    expect(SprintGoal.safeParse('a'.repeat(201)).success).toBe(false);
    expect(SPRINT_GOAL_MAX_LENGTH).toBe(200);
  });
});

describe('StartSprintRequest', () => {
  it('requires a goal', () => {
    expect(StartSprintRequest.parse({ goal: ' Login listo ' })).toEqual({ goal: 'Login listo' });
    expect(StartSprintRequest.safeParse({}).success).toBe(false);
    expect(StartSprintRequest.safeParse({ goal: '' }).success).toBe(false);
  });
});

describe('SprintResponse', () => {
  it('carries the board sprint fields plus the team', () => {
    expect(SprintResponse.parse(sprint)).toEqual(sprint);
    expect(SprintResponse.safeParse({ ...sprint, teamId: undefined }).success).toBe(false);
    expect(SprintResponse.safeParse({ ...sprint, startDate: '19/10/2026' }).success).toBe(false);
  });
});

describe('CloseSprintResponse', () => {
  it('returns the closed sprint and the ids of the cards sent back to the backlog', () => {
    const body = { sprint: { ...sprint, status: 'CLOSED' }, returnedCardIds: ['cz4a98xxat96iws9zmbrgj3c'] };
    expect(CloseSprintResponse.parse(body)).toEqual(body);
    expect(CloseSprintResponse.safeParse({ sprint }).success).toBe(false);
  });
});
