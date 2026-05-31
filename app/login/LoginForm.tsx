'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/Button';
import { login, requestPasswordReset, type LoginState } from './actions';

const initialState: LoginState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} fullWidth>
      Entrar
    </Button>
  );
}

export default function LoginForm() {
  const [loginState, loginAction] = useFormState(login, initialState);
  const [resetState, resetAction] = useFormState(
    requestPasswordReset,
    initialState
  );
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');

  const error = loginState.error ?? resetState.error;
  const success = resetState.resetEmailSent
    ? `Te hemos enviado un enlace a ${email || 'tu email'} para restablecer la contraseña.`
    : null;

  return (
    <form action={loginAction} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-text-main"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="tucorreo@ejemplo.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-text-main"
        >
          Contraseña
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2.5 pr-20 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-text-muted hover:text-text-main"
            aria-label={
              showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
            }
          >
            {showPassword ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {success && (
        <p
          role="status"
          className="rounded-card border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {success}
        </p>
      )}

      <SubmitButton />

      <button
        type="submit"
        formAction={resetAction}
        className="block w-full text-center text-sm text-text-muted hover:text-text-main"
      >
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  );
}
