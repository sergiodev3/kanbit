import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorMessage } from './error-messages';

describe('errorMessage', () => {
  it('localises known API error codes', () => {
    expect(errorMessage(new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'))).toBe(
      'Usuario o contraseña incorrectos.',
    );
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
