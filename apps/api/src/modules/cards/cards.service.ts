import {
  type BoardResponse,
  type CardResponse,
  type CardStatus,
  type CreateCardRequest,
  type SessionUser,
  type SprintStatus,
  type UpdateCardRequest,
  type Weekday,
  CardStatus as CardStatusEnum,
  comparePositions,
  positionBetween,
} from '@kanbit/shared';
import { type TeamAccess, assertTeamMemberOrTeacher, canEditCard, forbidden, isTeamMember } from '../../http/authz';
import { AppError } from '../../http/errors';
import type { Clock } from '../../lib/clock';
import { isUniqueViolation } from '../../lib/prisma';
import type { ProjectRecord } from '../projects/projects.service';
import type { TeamMemberRecord } from '../teams/teams.service';

export interface CardRecord {
  id: string;
  teamId: string;
  projectId: string;
  sprintId: string | null;
  assigneeId: string | null;
  title: string;
  doneCriteria: string | null;
  dueWeekday: Weekday | null;
  status: CardStatus;
  position: string;
  validated: boolean;
  validatedById: string | null;
  carriedOverCount: number;
  completedAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardTeamRecord extends TeamAccess {
  id: string;
  name: string;
  groupId: string;
  /** Ordered by `rowOrder`. */
  members: TeamMemberRecord[];
}

export interface SprintRecord {
  id: string;
  number: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`. */
  endDate: string;
  goal: string | null;
  status: SprintStatus;
  updatedAt: Date;
}

export interface NewCard {
  id: string;
  teamId: string;
  projectId: string;
  title: string;
  doneCriteria: string | null;
  dueWeekday: Weekday | null;
  status: CardStatus;
  position: string;
  createdById: string;
}

/** Content fields editable through `PATCH /cards/:id`. */
export interface CardContent {
  title?: string;
  doneCriteria?: string | null;
  dueWeekday?: Weekday | null;
  projectId?: string;
}

/** Types this module writes to `CardEvent.type`. */
export type CardEventType = 'CREATED' | 'EDITED';

export interface NewCardEvent {
  cardId: string;
  userId: string;
  type: CardEventType;
  fromStatus: CardStatus | null;
  toStatus: CardStatus | null;
}

/** Persistence port for cards; the Prisma adapter lives in `cards.repository.ts`. */
export interface CardsRepository {
  transaction<T>(fn: (repository: CardsRepository) => Promise<T>): Promise<T>;
  findTeam(teamId: string): Promise<BoardTeamRecord | null>;
  findOpenSprint(teamId: string): Promise<SprintRecord | null>;
  /** Ordered by creation. */
  listProjects(teamId: string): Promise<ProjectRecord[]>;
  /** Backlog cards (no sprint) plus the cards of `sprintId`, in no particular order. */
  listBoardCards(teamId: string, sprintId: string | null): Promise<CardRecord[]>;
  findProject(projectId: string): Promise<{ id: string; teamId: string } | null>;
  findCard(cardId: string): Promise<CardRecord | null>;
  /** Positions of the cards in one board cell (team, assignee, status), in no particular order. */
  listCellPositions(teamId: string, cell: { assigneeId: string | null; status: CardStatus }): Promise<string[]>;
  /** Throws a unique violation (P2002) when the id already exists. */
  createCard(card: NewCard): Promise<CardRecord>;
  /**
   * Applies `changes` only while the card's `updatedAt` still equals `version` (optimistic lock); returns null when
   * the card changed or disappeared meanwhile.
   */
  updateCard(cardId: string, version: Date, changes: CardContent & { updatedAt: Date }): Promise<CardRecord | null>;
  /** Deletes the card (its events cascade) only while `updatedAt` still equals `version`; false otherwise. */
  deleteCard(cardId: string, version: Date): Promise<boolean>;
  addEvent(event: NewCardEvent): Promise<void>;
}

/** `created` tells a new card (201) from an idempotent replay of an earlier POST (200). */
export interface CreateCardResult {
  card: CardResponse;
  created: boolean;
}

export interface CardsService {
  board(actor: SessionUser, teamId: string): Promise<BoardResponse>;
  create(actor: SessionUser, teamId: string, input: CreateCardRequest): Promise<CreateCardResult>;
  get(actor: SessionUser, cardId: string): Promise<CardResponse>;
  update(actor: SessionUser, cardId: string, input: UpdateCardRequest): Promise<CardResponse>;
  remove(actor: SessionUser, cardId: string): Promise<void>;
}

export interface CardsServiceDeps {
  repository: CardsRepository;
  clock: Clock;
}

const iso = (date: Date) => date.toISOString();

const idConflict = () => new AppError(409, 'ID_CONFLICT', 'A card with this id already exists');
const invalidProject = () => new AppError(400, 'INVALID_PROJECT', 'The project does not belong to the team');
const cardNotFound = () => new AppError(404, 'CARD_NOT_FOUND', 'Card not found');
const cardConflict = () => new AppError(409, 'CARD_CONFLICT', 'The card changed since it was loaded; reload and retry');
const cardIncomplete = () =>
  new AppError(400, 'CARD_INCOMPLETE', 'Cards outside the backlog need done criteria and a due weekday');

/** Optimistic concurrency (spec §5.3.1): a given `expectedUpdatedAt` must match the stored one exactly. */
const isStale = (card: CardRecord, expectedUpdatedAt: string | undefined): boolean =>
  expectedUpdatedAt !== undefined && new Date(expectedUpdatedAt).getTime() !== card.updatedAt.getTime();

export const toCardResponse = (card: CardRecord): CardResponse => ({
  ...card,
  completedAt: card.completedAt ? iso(card.completedAt) : null,
  createdAt: iso(card.createdAt),
  updatedAt: iso(card.updatedAt),
});

const COLUMN_ORDER: ReadonlyMap<CardStatus, number> = new Map(CardStatusEnum.options.map((status, i) => [status, i]));

/** Column order (BACKLOG → DONE), then bytewise position, then id so ties are stable. */
export const compareBoardCards = (a: CardRecord, b: CardRecord): number =>
  (COLUMN_ORDER.get(a.status) ?? 0) - (COLUMN_ORDER.get(b.status) ?? 0) ||
  comparePositions(a.position, b.position) ||
  comparePositions(a.id, b.id);

/** The bytewise-greatest position, or null for an empty cell. */
const lastPosition = (positions: readonly string[]): string | null =>
  positions.reduce<string | null>(
    (last, position) => (last === null || comparePositions(position, last) > 0 ? position : last),
    null,
  );

/** The team board and its cards (spec §2.4–2.5, §3). */
export function createCardsService({ repository, clock }: CardsServiceDeps): CardsService {
  /** A card the actor may see (team member or the group's teacher); anything else is reported as missing. */
  async function findVisible(repo: CardsRepository, actor: SessionUser, cardId: string) {
    const card = await repo.findCard(cardId);
    if (!card) throw cardNotFound();
    const team = await repo.findTeam(card.teamId);
    assertTeamMemberOrTeacher(actor, team, cardNotFound);
    return { card, team };
  }

  /** A visible card the actor may also edit (`canEditCard`), else 403. */
  async function findEditable(repo: CardsRepository, actor: SessionUser, cardId: string) {
    const found = await findVisible(repo, actor, cardId);
    if (!canEditCard(actor, found.team, found.card)) throw forbidden();
    return found;
  }

  async function assertTeamProject(repo: CardsRepository, projectId: string, teamId: string): Promise<void> {
    const project = await repo.findProject(projectId);
    if (project?.teamId !== teamId) throw invalidProject();
  }

  /**
   * Idempotent creation (spec §5.3.1): the same author repeating a POST to the same team gets the existing card;
   * any other reuse of the id is a conflict.
   */
  function replay(actor: SessionUser, teamId: string, existing: CardRecord): CreateCardResult {
    if (existing.createdById !== actor.id || existing.teamId !== teamId) throw idConflict();
    return { card: toCardResponse(existing), created: false };
  }

  return {
    async board(actor, teamId) {
      const team = await repository.findTeam(teamId);
      assertTeamMemberOrTeacher(actor, team);
      const sprint = await repository.findOpenSprint(teamId);
      const [projects, cards] = await Promise.all([
        repository.listProjects(teamId),
        repository.listBoardCards(teamId, sprint?.id ?? null),
      ]);
      return {
        team: {
          id: team.id,
          name: team.name,
          groupId: team.groupId,
          moderatorId: team.members.find((member) => member.isModerator)?.userId ?? null,
        },
        members: team.members.map(({ userId, name, username, isModerator, rowOrder }) => ({
          userId,
          name,
          username,
          isModerator,
          rowOrder,
        })),
        sprint: sprint ? { ...sprint, updatedAt: iso(sprint.updatedAt) } : null,
        projects: projects.map((project) => ({ ...project, updatedAt: iso(project.updatedAt) })),
        cards: [...cards].sort(compareBoardCards).map(toCardResponse),
      };
    },

    async create(actor, teamId, input) {
      const team = await repository.findTeam(teamId);
      assertTeamMemberOrTeacher(actor, team);
      // Spec §3: members and the moderator create cards; the teacher only reads.
      if (!isTeamMember(actor, team)) throw forbidden();

      const existing = await repository.findCard(input.id);
      if (existing) return replay(actor, teamId, existing);
      await assertTeamProject(repository, input.projectId, teamId);

      try {
        const card = await repository.transaction(async (tx) => {
          // New cards go to the end of the unassigned Backlog cell.
          const cell = { assigneeId: null, status: 'BACKLOG' } as const;
          const created = await tx.createCard({
            id: input.id,
            teamId,
            projectId: input.projectId,
            title: input.title,
            doneCriteria: input.doneCriteria ?? null,
            dueWeekday: input.dueWeekday ?? null,
            status: cell.status,
            position: positionBetween(lastPosition(await tx.listCellPositions(teamId, cell)), null),
            createdById: actor.id,
          });
          await tx.addEvent({
            cardId: created.id,
            userId: actor.id,
            type: 'CREATED',
            fromStatus: null,
            toStatus: created.status,
          });
          return created;
        });
        return { card: toCardResponse(card), created: true };
      } catch (err) {
        // A concurrent POST inserted the same id between our read and our insert.
        if (!isUniqueViolation(err)) throw err;
        const raced = await repository.findCard(input.id);
        if (!raced) throw err;
        return replay(actor, teamId, raced);
      }
    },

    async get(actor, cardId) {
      return toCardResponse((await findVisible(repository, actor, cardId)).card);
    },

    async update(actor, cardId, { expectedUpdatedAt, title, doneCriteria, dueWeekday, projectId }) {
      return repository.transaction(async (tx) => {
        const { card } = await findEditable(tx, actor, cardId);
        if (isStale(card, expectedUpdatedAt)) throw cardConflict();
        // Spec §6.1: outside the Backlog a card must keep its done criteria and due weekday.
        if (card.status !== 'BACKLOG' && (doneCriteria === null || dueWeekday === null)) throw cardIncomplete();
        if (projectId !== undefined && projectId !== card.projectId) {
          await assertTeamProject(tx, projectId, card.teamId);
        }

        const changes: CardContent = {};
        if (title !== undefined) changes.title = title;
        if (doneCriteria !== undefined) changes.doneCriteria = doneCriteria;
        if (dueWeekday !== undefined) changes.dueWeekday = dueWeekday;
        if (projectId !== undefined) changes.projectId = projectId;

        const updated = await tx.updateCard(card.id, card.updatedAt, { ...changes, updatedAt: clock.now() });
        if (!updated) throw cardConflict();
        await tx.addEvent({ cardId: card.id, userId: actor.id, type: 'EDITED', fromStatus: null, toStatus: null });
        return toCardResponse(updated);
      });
    },

    async remove(actor, cardId) {
      await repository.transaction(async (tx) => {
        const { card } = await findEditable(tx, actor, cardId);
        if (card.status !== 'BACKLOG') {
          throw new AppError(409, 'CARD_NOT_IN_BACKLOG', 'Only backlog cards can be deleted');
        }
        // The version guard stops a delete racing a concurrent move out of the Backlog.
        if (!(await tx.deleteCard(card.id, card.updatedAt))) throw cardConflict();
      });
    },
  };
}
