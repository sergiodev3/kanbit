import type {
  CardResponse,
  CloseSprintResponse,
  SprintResponse,
  StartSprintRequest,
  ValidateAllResponse,
  ValidateCardRequest,
} from '@kanbit/shared';
import { apiPost } from '../../lib/api';
import { useBoardMutation } from '../board/board.api';

// Every sprint write refetches the board when it settles: the sprint, its dates and the cards all live there.
// Callers show failures with `errorMessage(mutation.error)`.

/** "Iniciar sprint de la semana": the server picks the number and the Monday–Friday dates. */
export const useStartSprint = (teamId: string) =>
  useBoardMutation(teamId, (body: StartSprintRequest) => apiPost<SprintResponse>(`/teams/${teamId}/sprints`, body));

/** "Cerrar sprint": unfinished cards go back to the Backlog with their assignee. */
export const useCloseSprint = (teamId: string) =>
  useBoardMutation(teamId, (sprintId: string) => apiPost<CloseSprintResponse>(`/sprints/${sprintId}/close`));

export type ValidateCardVariables = ValidateCardRequest & { cardId: string };

/** "Validar" one card in Por hacer; `expectedUpdatedAt` answers 409 `CARD_CONFLICT` when the card changed. */
export const useValidateCard = (teamId: string) =>
  useBoardMutation(teamId, ({ cardId, ...body }: ValidateCardVariables) =>
    apiPost<CardResponse>(`/cards/${cardId}/validate`, body),
  );

/** "Validar todas": every unvalidated Por hacer card of the open sprint. */
export const useValidateAll = (teamId: string) =>
  useBoardMutation(teamId, (_: void) => apiPost<ValidateAllResponse>(`/teams/${teamId}/cards/validate-all`));
