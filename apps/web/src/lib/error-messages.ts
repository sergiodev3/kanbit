import { ApiError } from './api';

/** es-MX user-facing text per API error `code`. API messages are English and never shown. */
const MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Revisa los datos del formulario.',
  UNAUTHENTICATED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  RATE_LIMITED: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
  INVALID_CREDENTIALS: 'Usuario o contraseña incorrectos.',
  INVALID_ACCESS_CODE: 'El código de grupo no existe. Verifícalo con tu docente.',
  REGISTRATION_CLOSED: 'El registro de este grupo está cerrado. Consulta a tu docente.',
  USERNAME_TAKEN: 'Ese usuario ya está registrado. Elige otro o inicia sesión.',
  INVALID_CURRENT_PASSWORD: 'La contraseña actual no es correcta.',
  USER_NOT_FOUND: 'No se encontró el usuario.',
  GROUP_NOT_FOUND: 'No se encontró el grupo.',
  TEAM_NOT_FOUND: 'No se encontró el equipo.',
  PROJECT_NOT_FOUND: 'No se encontró el proyecto.',
  INVALID_MEMBERS: 'Algunos alumnos seleccionados no pertenecen a este grupo.',
  NOT_A_TEAM_MEMBER: 'El alumno no pertenece a este equipo.',
  TEAM_HAS_CARDS: 'No se puede eliminar un equipo que ya tiene tarjetas.',
  MEMBERS_CONFLICT: 'Alguien más modificó el equipo. Recarga e intenta de nuevo.',
};

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo.';
const NETWORK_MESSAGE = 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? GENERIC_MESSAGE;
  // fetch rejects with a TypeError when the network is unreachable.
  if (error instanceof TypeError) return NETWORK_MESSAGE;
  return GENERIC_MESSAGE;
}
