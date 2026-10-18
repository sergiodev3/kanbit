import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app/router';
import { mockApi, renderRoutes, unauthenticated } from '../../test/utils';
import { CHECKIN_QUESTIONS } from '../meetings/meetings-model';

// UpdatePrompt imports `virtual:pwa-register/react`, which exists only under the PWA plugin (not loaded in tests).
vi.mock('../../shared/pwa/UpdatePrompt', () => ({ UpdatePrompt: () => null }));

afterEach(() => vi.unstubAllGlobals());

describe('help page', () => {
  it('opens at /ayuda without a session and covers the main flows', async () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/ayuda']);

    expect(await screen.findByRole('heading', { level: 1, name: 'Ayuda' })).toBeInTheDocument();
    for (const name of ['Entra por primera vez', 'El tablero', 'Mueve tarjetas', 'La validación del moderador', 'Tu reporte diario']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('quotes the check-in questions exactly as the form shows them', async () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/ayuda']);

    const section = (await screen.findByRole('heading', { name: 'Tu reporte diario' })).closest('section');
    expect(section).not.toBeNull();
    for (const question of Object.values(CHECKIN_QUESTIONS)) {
      expect(within(section as HTMLElement).getByText(question)).toBeInTheDocument();
    }
  });

  it('is reachable from the header link', async () => {
    mockApi({ 'GET /auth/me': unauthenticated });

    renderRoutes(routes, ['/login']);

    expect(await screen.findByRole('link', { name: 'Ayuda' })).toHaveAttribute('href', '/ayuda');
  });
});
