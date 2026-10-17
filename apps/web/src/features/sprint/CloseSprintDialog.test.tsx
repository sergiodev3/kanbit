import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryClient } from '../../app/query-client';
import { sprintFixture } from '../../test/board-fixtures';
import { errorResponse, jsonResponse, mockApi } from '../../test/utils';
import { CloseSprintDialog } from './CloseSprintDialog';

function renderDialog(unfinished: number) {
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={createQueryClient()}>
      <CloseSprintDialog teamId="t1" sprint={sprintFixture()} unfinished={unfinished} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose, dialog: screen.getByRole('dialog', { name: '¿Cerrar el sprint 3?' }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CloseSprintDialog', () => {
  it('says how many unfinished cards return and focuses "Cancelar"', () => {
    const { dialog } = renderDialog(1);

    expect(dialog).toHaveTextContent(
      '1 tarjeta sin terminar regresará al Backlog con su responsable; las terminadas se archivan con el sprint.',
    );
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  });

  it('closes the sprint and the dialog', async () => {
    const fetchMock = mockApi({
      'POST /sprints/s1/close': () =>
        jsonResponse(200, { sprint: { ...sprintFixture({ status: 'CLOSED' }), teamId: 't1' }, returnedCardIds: [] }),
    });
    const { dialog, onClose } = renderDialog(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sprint' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('explains a sprint that was already closed', async () => {
    mockApi({ 'POST /sprints/s1/close': () => errorResponse(409, 'SPRINT_CLOSED') });
    const { dialog, onClose } = renderDialog(2);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sprint' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Este sprint ya se cerró.');
    expect(onClose).not.toHaveBeenCalled();
  });
});
