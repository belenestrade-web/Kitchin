// Tipos compartidos entre el Server Component y el Client Component de la pantalla PDF.
// Sin imports de @react-pdf/renderer — este archivo se carga también en el servidor.

export interface LineaPdfData {
  nombre_modulo: string
  tipo: string
  medida: string
  unidades: number
  precio_unitario: number
  subtotal: number
  editado_manualmente: boolean
}

export interface TiendaPdfData {
  nombre: string
  email_contacto: string | null
  telefono: string | null
  direccion: string | null
  color_primario: string
  condiciones_comerciales: string | null
  iva_porcentaje: number
}

export interface PresupuestoPdfDocProps {
  numeroPdf: string        // '2026-0001' o '---' si aún no asignado
  fecha: string            // ya formateada en es-ES
  clienteNombre: string
  clienteEmail: string
  clienteTelefono: string
  lineas: LineaPdfData[]
  tienda: TiendaPdfData
  logoBase64: string | null
  totalNeto: number
  totalIva: number
  totalBruto: number
}

export interface PdfClientPageProps {
  presupuestoId: string
  tiendaId: string
  pdfUrlInicial: string | null      // path en Storage si el PDF ya existe
  numeroPdfInicial: string | null
  signedUrlInicial: string | null   // signed URL 365 días si el PDF ya existe
  docProps: PresupuestoPdfDocProps
}
