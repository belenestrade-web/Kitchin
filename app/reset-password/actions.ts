'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface ResetPasswordState {
  error?: string;
}

export async function updatePassword(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }
  if (password !== confirm) {
    return { error: 'Las contraseñas no coinciden.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'El enlace ha caducado. Pide uno nuevo desde el login.' };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: 'No se pudo actualizar la contraseña. Inténtalo de nuevo.' };
  }

  redirect('/dashboard');
}
