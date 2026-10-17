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
