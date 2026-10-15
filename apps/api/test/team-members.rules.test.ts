import { describe, expect, it } from 'vitest';
import { planMembers } from '../src/modules/teams/team-members.rules';

describe('planMembers', () => {
  it('creates every member of an empty team in order; the first one moderates', () => {
    expect(planMembers([], ['ana', 'beto'], null)).toEqual({
      remove: [],
      create: [
        { userId: 'ana', rowOrder: 0, isModerator: true },
        { userId: 'beto', rowOrder: 1, isModerator: false },
      ],
      keep: [],
      moderatorId: 'ana',
    });
  });

  it('keeps the current moderator while they stay, and reorders kept rows by the new index', () => {
    expect(planMembers(['ana', 'beto'], ['carla', 'beto', 'ana'], 'beto')).toEqual({
      remove: [],
      create: [{ userId: 'carla', rowOrder: 0, isModerator: false }],
      keep: [
        { userId: 'beto', rowOrder: 1, isModerator: true },
        { userId: 'ana', rowOrder: 2, isModerator: false },
      ],
      moderatorId: 'beto',
    });
  });

  it('hands moderation to the first remaining member when the moderator is removed', () => {
    expect(planMembers(['ana', 'beto', 'carla'], ['carla', 'beto'], 'ana')).toEqual({
      remove: ['ana'],
      create: [],
      keep: [
        { userId: 'carla', rowOrder: 0, isModerator: true },
        { userId: 'beto', rowOrder: 1, isModerator: false },
      ],
      moderatorId: 'carla',
    });
  });

  it('leaves no moderator when the team is emptied', () => {
    expect(planMembers(['ana', 'beto'], [], 'ana')).toEqual({
      remove: ['ana', 'beto'],
      create: [],
      keep: [],
      moderatorId: null,
    });
  });

  it('assigns a moderator when the team had members but none moderating', () => {
    expect(planMembers(['ana'], ['ana'], null).moderatorId).toBe('ana');
  });

  it('refuses duplicate desired members', () => {
    expect(() => planMembers([], ['ana', 'ana'], null)).toThrow(/duplicate/i);
  });
});
