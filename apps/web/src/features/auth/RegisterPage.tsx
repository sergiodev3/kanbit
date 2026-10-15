import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RegisterRequest,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@kanbit/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { fieldErrorsFrom, orderedErrors, type FieldErrors, type FieldMessages } from '../../shared/forms/form-errors';
import { cardClasses, ErrorSummary, linkClasses, SubmitButton } from '../../shared/forms/FormParts';
import { TextField } from '../../shared/forms/TextField';
import { homePathFor, useMe, useRegister } from './auth.api';

const PASSWORD_MISMATCH = 'Las contraseñas no coinciden.';

type Field = 'accessCode' | 'name' | 'username' | 'password' | 'confirmPassword';
const FIELDS: readonly Field[] = ['accessCode', 'name', 'username', 'password', 'confirmPassword'];
const MESSAGES: FieldMessages<Field> = {
  accessCode: 'Escribe el código de grupo que te dio tu docente.',
  name: `Escribe tu nombre (máximo ${NAME_MAX_LENGTH} caracteres).`,
  username: `Usa de ${USERNAME_MIN_LENGTH} a ${USERNAME_MAX_LENGTH} caracteres: letras, números, punto, guion o guion bajo.`,
  password: `La contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
  confirmPassword: PASSWORD_MISMATCH,
};

/** Student self-registration with a group code (spec §8.1); share links use `/register?code=XXXXXX`. */
export function RegisterPage() {
  const me = useMe();
  const register = useRegister();
  const [searchParams] = useSearchParams();
  const [accessCode, setAccessCode] = useState(() => (searchParams.get('code') ?? '').trim().toUpperCase());
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  // A successful registration stores the session in `['me']`, which lands here.
  if (me.data) return <Navigate to={homePathFor(me.data.user.role)} replace />;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = RegisterRequest.safeParse({ accessCode, name, username, password });
    const nextErrors: FieldErrors<Field> = parsed.success ? {} : fieldErrorsFrom(parsed.error.issues, MESSAGES);
    if (confirmPassword !== password) nextErrors.confirmPassword = PASSWORD_MISMATCH;
    setErrors(nextErrors);
    if (parsed.success && Object.keys(nextErrors).length === 0) register.mutate(parsed.data);
  };

  const summary = [...orderedErrors(errors, FIELDS), ...(register.isError ? [errorMessage(register.error)] : [])];

  return (
    <section aria-labelledby="register-title" className="mx-auto max-w-sm space-y-6 py-4">
      <div className="space-y-1">
        <h1 id="register-title" className="text-2xl font-bold">
          Crear cuenta de alumno
        </h1>
        <p className="text-sm text-slate-600">Necesitas el código de grupo que comparte tu docente.</p>
      </div>
      <form noValidate onSubmit={submit} className={cardClasses}>
        <ErrorSummary messages={summary} />
        <TextField
          id="register-code"
          label="Código de grupo"
          value={accessCode}
          onChange={(value) => setAccessCode(value.toUpperCase())}
          error={errors.accessCode}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
        />
        <TextField
          id="register-name"
          label="Nombre completo"
          value={name}
          onChange={setName}
          error={errors.name}
          autoComplete="name"
          maxLength={NAME_MAX_LENGTH}
          required
        />
        <TextField
          id="register-username"
          label="Matrícula o usuario"
          hint="Con este dato iniciarás sesión."
          value={username}
          onChange={setUsername}
          error={errors.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <TextField
          id="register-password"
          label="Contraseña"
          type="password"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="new-password"
          required
        />
        <TextField
          id="register-confirm"
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          error={errors.confirmPassword}
          autoComplete="new-password"
          required
        />
        <SubmitButton pending={register.isPending} pendingLabel="Creando cuenta…">
          Crear cuenta
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-700">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className={linkClasses}>
          Inicia sesión
        </Link>
      </p>
    </section>
  );
}
