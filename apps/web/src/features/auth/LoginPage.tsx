import { LoginRequest } from '@kanbit/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { errorMessage } from '../../lib/error-messages';
import { fieldErrorsFrom, orderedErrors, type FieldErrors, type FieldMessages } from '../../shared/forms/form-errors';
import { cardClasses, ErrorSummary, linkClasses, SubmitButton } from '../../shared/forms/FormParts';
import { TextField } from '../../shared/forms/TextField';
import { homePathFor, useLogin, useMe } from './auth.api';
import type { LoginRedirectState } from './RequireAuth';

type Field = 'username' | 'password';
const FIELDS: readonly Field[] = ['username', 'password'];
const MESSAGES: FieldMessages<Field> = {
  username: 'Escribe tu usuario.',
  password: 'Escribe tu contraseña.',
};

/** Only same-app paths are followed after login (no open redirects, no auth-page loops). */
function safeReturnPath(state: unknown): string | undefined {
  const from = (state as LoginRedirectState | null)?.from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return undefined;
  if (from.startsWith('/login') || from.startsWith('/register')) return undefined;
  return from;
}

export function LoginPage() {
  const me = useMe();
  const login = useLogin();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});

  // A successful login stores the session in `['me']`, which lands here.
  if (me.data) {
    return <Navigate to={safeReturnPath(location.state) ?? homePathFor(me.data.user.role)} replace />;
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = LoginRequest.safeParse({ username, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error.issues, MESSAGES));
      return;
    }
    setErrors({});
    login.mutate(parsed.data);
  };

  const summary = [...orderedErrors(errors, FIELDS), ...(login.isError ? [errorMessage(login.error)] : [])];

  return (
    <section aria-labelledby="login-title" className="mx-auto max-w-sm space-y-6 py-4">
      <h1 id="login-title" className="text-2xl font-bold">
        Iniciar sesión
      </h1>
      <form noValidate onSubmit={submit} className={cardClasses}>
        <ErrorSummary messages={summary} />
        <TextField
          id="login-username"
          label="Usuario"
          value={username}
          onChange={setUsername}
          error={errors.username}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <TextField
          id="login-password"
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <SubmitButton pending={login.isPending} pendingLabel="Entrando…">
          Iniciar sesión
        </SubmitButton>
      </form>
      <p className="text-center text-sm text-slate-700">
        ¿Eres alumno y tienes un código de grupo?{' '}
        <Link to="/register" className={linkClasses}>
          Crea tu cuenta
        </Link>
      </p>
    </section>
  );
}
