'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export interface CrearBorradorState {
  error?: string;
}

const MAX_BYTES = 20 * 1024 * 1024;
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function emailValido(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function crearBorradorDesdePlano(
  formData: FormData
): Promise<CrearBorradorState> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Selecciona o arrastra el plano antes de continuar.' };
  }

  const ext = MIME_TO_EXT[file.type];
  if (!ext) {
    return { error: 'Formato no admitido. Usa JPG, PNG, WEBP o PDF.' };
  }
  if (file.size > MAX_BYTES) {
    return { error: 'El archivo supera el máximo de 20MB.' };
  }

  const clienteNombre = String(formData.get('cliente_nombre') ?? '').trim();
  const clienteEmail = String(formData.get('cliente_email') ?? '').trim();
  const clienteTelefono = String(formData.get('cliente_telefono') ?? '').trim();

  if (clienteEmail && !emailValido(clienteEmail)) {
    return { error: 'El email del cliente no parece válido.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: usuario, error: usuarioErr } = await supabase
    .from('usuarios')
    .select('tienda_id')
    .eq('id', user.id)
    .maybeSingle();
  if (usuarioErr || !usuario) {
    return {
      error: 'Tu cuenta no está vinculada a una tienda. Vuelve a iniciar sesión.',
    };
  }

  const path = `${usuario.tienda_id}/${randomUUID()}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from('planos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadErr) {
    return { error: `No se pudo subir el plano: ${uploadErr.message}` };
  }

  const { data: borrador, error: insertErr } = await supabase
    .from('presupuestos')
    .insert({
      tienda_id: usuario.tienda_id,
      usuario_id: user.id,
      cliente_nombre: clienteNombre || null,
      cliente_email: clienteEmail || null,
      cliente_telefono: clienteTelefono || null,
      imagen_url: path,
      estado: 'borrador',
    })
    .select('id')
    .single();
  if (insertErr || !borrador) {
    await supabase.storage.from('planos').remove([path]);
    return {
      error: `No se pudo crear el borrador: ${insertErr?.message ?? 'desconocido'}`,
    };
  }

  revalidatePath('/dashboard');
  redirect(`/presupuestos/${borrador.id}`);
}
