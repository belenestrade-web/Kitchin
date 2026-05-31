import { notFound, redirect } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PdfClientPageProps, LineaPdfData } from './pdf-types'

export const metadata = { title: 'Generar PDF · Kitchin' }

// ssr: false evita que @react-pdf/renderer se incluya en el bundle de servidor.
const PdfClientPage = dynamic<PdfClientPageProps>(
  () => import('./PdfClientPage'),
  { ssr: false },
)

const fmtDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' })
const TTL_SIGNED_URL = 365 * 24 * 60 * 60

export default async function PdfPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('tienda_id')
    .eq('id', user.id)
    .maybeSingle()
  if (!usuario) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const { data: presupuesto } = await supabase
    .from('presupuestos')
    .select(
      'id, tienda_id, cliente_nombre, cliente_email, cliente_telefono, total_neto, total_iva, total_bruto, pdf_url, numero_presupuesto, created_at',
    )
    .eq('id', params.id)
    .maybeSingle()
  if (!presupuesto) notFound()

  const { data: tienda } = await supabase
    .from('tiendas')
    .select(
      'nombre, logo_url, email_contacto, telefono, direccion, color_primario, condiciones_comerciales, iva_porcentaje',
    )
    .eq('id', usuario.tienda_id)
    .maybeSingle()
  if (!tienda) notFound()

  const { data: lineasRaw } = await supabase
    .from('lineas_presupuesto')
    .select(
      'nombre_modulo, tipo, medida, unidades, precio_unitario, subtotal, editado_manualmente',
    )
    .eq('presupuesto_id', params.id)
    .order('orden', { ascending: true })

  const lineas: LineaPdfData[] = (lineasRaw ?? []).map((l) => ({
    nombre_modulo: l.nombre_modulo,
    tipo: l.tipo,
    medida: l.medida ?? '',
    unidades: l.unidades,
    precio_unitario: Number(l.precio_unitario),
    subtotal: Number(l.subtotal),
    editado_manualmente: l.editado_manualmente,
  }))

  // Logo como base64 para react-pdf (evita CORS en el render del cliente).
  // El bucket 'logos' es público, pero el fetch se hace server-side para seguridad.
  let logoBase64: string | null = null
  if (tienda.logo_url) {
    try {
      const { data: logoPublic } = supabase.storage
        .from('logos')
        .getPublicUrl(tienda.logo_url)
      const res = await fetch(logoPublic.publicUrl)
      if (res.ok) {
        const buf = await res.arrayBuffer()
        const mime = res.headers.get('content-type') ?? 'image/png'
        logoBase64 = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
      }
    } catch {
      // Sin logo no es error fatal; el PDF se genera sin él
    }
  }

  // Si el PDF ya existe, generar signed URL para los botones de compartir.
  let signedUrlInicial: string | null = null
  if (presupuesto.pdf_url) {
    const admin = createAdminClient()
    const { data: signed } = await admin.storage
      .from('pdfs')
      .createSignedUrl(presupuesto.pdf_url, TTL_SIGNED_URL)
    signedUrlInicial = signed?.signedUrl ?? null
  }

  return (
    <PdfClientPage
      presupuestoId={presupuesto.id}
      tiendaId={usuario.tienda_id}
      pdfUrlInicial={presupuesto.pdf_url ?? null}
      numeroPdfInicial={presupuesto.numero_presupuesto ?? null}
      signedUrlInicial={signedUrlInicial}
      docProps={{
        numeroPdf: presupuesto.numero_presupuesto ?? '---',
        fecha: fmtDate.format(new Date(presupuesto.created_at)),
        clienteNombre: presupuesto.cliente_nombre ?? '',
        clienteEmail: presupuesto.cliente_email ?? '',
        clienteTelefono: presupuesto.cliente_telefono ?? '',
        lineas,
        tienda: {
          nombre: tienda.nombre,
          email_contacto: tienda.email_contacto,
          telefono: tienda.telefono,
          direccion: tienda.direccion,
          color_primario: tienda.color_primario,
          condiciones_comerciales: tienda.condiciones_comerciales,
          iva_porcentaje: tienda.iva_porcentaje,
        },
        logoBase64,
        totalNeto: Number(presupuesto.total_neto),
        totalIva: Number(presupuesto.total_iva),
        totalBruto: Number(presupuesto.total_bruto),
      }}
    />
  )
}
