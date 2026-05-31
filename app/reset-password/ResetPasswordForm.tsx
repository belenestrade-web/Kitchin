'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Button } from '@/components/Button';
import { updatePassword, type ResetPasswordState } from './actions';

const initialState: ResetPasswordState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} fullWidth>
      Guardar contraseña nueva
    </Button>
  );
}

export default function ResetPasswordForm() {
  const [state, action] = useFormState(updatePassword, initialState);

  return (
    <form action={action} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-text-main"
        >
          Nueva contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2.5 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div>
        <label
          htmlFor="confirm"
          className="block text-sm font-medium text-text-main"
        >
          Repite la contraseña
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2.5 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
