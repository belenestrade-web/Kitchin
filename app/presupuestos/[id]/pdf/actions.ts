'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// NOTA: modificado respecto a docx sec 7 / Pantalla 5 —
// TTL de 365 días aprobado en Paso 12; se revisará en Paso 14 (hardening).
const TTL_SIGNED_URL = 365 * 24 * 60 * 60

type FinalizarResult =
  | { ok: true; numeroPdf: string; signedUrl: string }
  | { ok: false; error: string }

export async function finalizarPdf(
  presupuestoId: string,
  pdfPath: string,
): Promise<FinalizarResult> {
  if (
    typeof presupuestoId !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(presupuestoId) ||
    typeof pdfPath !== 'string' ||
    pdfPath.length === 0 ||
    pdfPath.length > 300
  ) {
    return { ok: false, error: 'Parámetros inválidos' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { data, error } = await supabase.rpc('generar_pdf_presupuesto', {
    p_presupuesto_id: presupuestoId,
    p_pdf_url: pdfPath,
  })
  if (error) return { ok: false, error: error.message }

  const admin = createAdminClient()
  const { data: signed, error: signedErr } = await admin.storage
    .from('pdfs')
    .createSignedUrl(pdfPath, TTL_SIGNED_URL)
  if (signedErr || !signed?.signedUrl) {
    return {
      ok: false,
      error: 'PDF guardado pero no se pudo generar la URL para compartir',
    }
  }

  revalidatePath(`/presupuestos/${presupuestoId}`)
  revalidatePath('/dashboard')

  return {
    ok: true,
    numeroPdf: (data as { numero_presupuesto: string }).numero_presupuesto,
    signedUrl: signed.signedUrl,
  }
}

export async function marcarEnviado(
  presupuestoId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof presupuestoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(presupuestoId)) {
    return { ok: false, error: 'Parámetros inválidos' }
  }

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error } = await supabase
    .from('presupuestos')
    .update({ estado: 'enviado' })
    .eq('id', presupuestoId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/presupuestos/${presupuestoId}`)
  revalidatePath('/dashboard')
  return { ok: true }
}
