import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorMessage } from './error-messages';

describe('errorMessage', () => {
  it('localises known API error codes', () => {
    expect(errorMessage(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'))).toBe(
      'Usuario o contraseña incorrectos.',
    );
  });

  it('explains a card conflict as a reloaded board', () => {
    expect(errorMessage(new ApiError(409, 'CARD_CONFLICT', 'Card changed'))).toBe(
      'La tarjeta cambió mientras la editabas; se recargó el tablero. Revisa e intenta de nuevo.',
    );
  });

  it.each(['ID_CONFLICT', 'CARD_NOT_IN_BACKLOG', 'CARD_INCOMPLETE', 'INVALID_POSITION', 'INVALID_PROJECT', 'CARD_NOT_FOUND'])(
    'localises the board error %s',
    (code) => {
      expect(errorMessage(new ApiError(400, code, code))).not.toBe('Ocurrió un error inesperado. Intenta de nuevo.');
    },
  );

  it.each([
    ['NO_OPEN_SPRINT', 'No hay un sprint abierto. El moderador debe iniciar el sprint de la semana.'],
    ['CARD_NOT_VALIDATED', 'La tarjeta debe estar validada por el moderador antes de pasar a En marcha o Terminado.'],
    ['CARD_NOT_IN_TODO', 'Solo se pueden validar tarjetas que están en Por hacer.'],
    ['SPRINT_ALREADY_OPEN', 'Ya hay un sprint abierto para este equipo.'],
    ['SPRINT_CLOSED', 'Este sprint ya se cerró.'],
    ['SPRINT_NOT_FOUND', 'No se encontró el sprint.'],
  ])('localises the sprint error %s', (code, message) => {
    expect(errorMessage(new ApiError(409, code, code))).toBe(message);
  });

  it('uses a generic message for unknown codes', () => {
    expect(errorMessage(new ApiError(418, 'TEAPOT', 'I am a teapot'))).toBe(
      'Ocurrió un error inesperado. Intenta de nuevo.',
    );
  });

  it('explains network failures', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe(
      'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
    );
  });
});
