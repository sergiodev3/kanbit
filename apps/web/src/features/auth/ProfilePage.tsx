import { ChangePasswordRequest, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type MeResponse } from '@kanbit/shared';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../../lib/error-messages';
import { fieldErrorsFrom, orderedErrors, type FieldErrors, type FieldMessages } from '../../shared/forms/form-errors';
import { cardClasses, ErrorSummary, SubmitButton } from '../../shared/forms/FormParts';
import { TextField } from '../../shared/forms/TextField';
import { useChangePassword, useMe } from './auth.api';

const ROLE_LABELS: Record<MeResponse['user']['role'], string> = { TEACHER: 'Docente', STUDENT: 'Alumno' };

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="text-right text-sm font-semibold">{value}</dd>
    </div>
  );
}

/** Spec §8.2 "Mi perfil": who I am and change password. */
export function ProfilePage() {
  const me = useMe();
  if (!me.data) return null;
  const { user, memberships } = me.data;

  return (
    <div className="space-y-6">
      <section aria-labelledby="profile-title" className="space-y-3">
        <h1 id="profile-title" className="text-2xl font-bold">
          Mi perfil
        </h1>
        <dl className="divide-y divide-slate-200 rounded-xl bg-white px-4 shadow-sm ring-1 ring-slate-200">
          <InfoRow label="Nombre" value={user.name} />
          <InfoRow label="Usuario" value={user.username} />
          <InfoRow label="Rol" value={ROLE_LABELS[user.role]} />
        </dl>
        {memberships.length > 0 && (
          <ul aria-label="Mis grupos" className="space-y-2">
            {memberships.map((membership) => (
              <li key={membership.groupId} className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="font-semibold">{membership.groupName}</p>
                <p className="text-sm text-slate-600">
                  {membership.teamName
                    ? `Equipo: ${membership.teamName}${membership.isModerator ? ' (moderador)' : ''}`
                    : 'Aún sin equipo asignado'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ChangePasswordForm />
    </div>
  );
}

const PASSWORD_MISMATCH = 'Las contraseñas no coinciden.';

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword';
const FIELDS: readonly Field[] = ['currentPassword', 'newPassword', 'confirmPassword'];
const MESSAGES: FieldMessages<Field> = {
  currentPassword: 'Escribe tu contraseña actual.',
  // `custom` is the shared schema's "must differ from the current one" refinement.
  newPassword: (code) =>
    code === 'custom'
      ? 'La nueva contraseña debe ser distinta de la actual.'
      : `La nueva contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
  confirmPassword: PASSWORD_MISMATCH,
};

function ChangePasswordForm() {
  const changePassword = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = ChangePasswordRequest.safeParse({ currentPassword, newPassword });
    const nextErrors: FieldErrors<Field> = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues, MESSAGES);
    if (confirmPassword !== newPassword) nextErrors.confirmPassword = PASSWORD_MISMATCH;
    setErrors(nextErrors);
    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      changePassword.reset();
      return;
    }
    changePassword.mutate(parsed.data, {
      onSuccess: () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      },
    });
  };

  const summary = [
    ...orderedErrors(errors, FIELDS),
    ...(changePassword.isError ? [errorMessage(changePassword.error)] : []),
  ];

  return (
    <section aria-labelledby="password-title" className="space-y-3">
      <h2 id="password-title" className="text-lg font-bold">
        Cambiar contraseña
      </h2>
      <form noValidate onSubmit={submit} className={cardClasses}>
        <ErrorSummary messages={summary} />
        {changePassword.isSuccess && (
          <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">
            Contraseña actualizada.
          </p>
        )}
        <TextField
          id="current-password"
          label="Contraseña actual"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          error={errors.currentPassword}
          autoComplete="current-password"
          required
        />
        <TextField
          id="new-password"
          label="Nueva contraseña"
          type="password"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
          value={newPassword}
          onChange={setNewPassword}
          error={errors.newPassword}
          autoComplete="new-password"
          required
        />
        <TextField
          id="confirm-new-password"
          label="Confirmar nueva contraseña"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
        />
        <SubmitButton pending={changePassword.isPending} pendingLabel="Guardando…">
          Cambiar contraseña
        </SubmitButton>
      </form>
    </section>
  );
}
