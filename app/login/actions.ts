'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface LoginState {
  error?: string;
  resetEmailSent?: boolean;
}

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Introduce email y contraseña.' };
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: 'Email o contraseña incorrectos.' };
  }

  // Verifica que el usuario auth está vinculado a una tienda. Si no lo está,
  // la app no puede mostrar nada por RLS, así que cerramos sesión y avisamos.
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!usuario) {
    await supabase.auth.signOut();
    return {
      error:
        'Tu cuenta no está vinculada a una tienda. Contacta con el administrador.',
    };
  }

  redirect('/dashboard');
}

export async function requestPasswordReset(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    return { error: 'Introduce tu email arriba antes de pedir el enlace.' };
  }

  const supabase = createClient();
  const origin = headers().get('origin') ?? 'http://localhost:3000';

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return { error: 'No se pudo enviar el enlace. Inténtalo de nuevo.' };
  }

  return { resetEmailSent: true };
}
