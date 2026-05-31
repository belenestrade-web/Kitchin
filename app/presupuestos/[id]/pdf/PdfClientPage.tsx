'use client'

import { useState, useEffect, useRef } from 'react'
import { usePDF, pdf as renderPdf } from '@react-pdf/renderer'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PresupuestoPdfDoc from './PresupuestoPdfDoc'
import { finalizarPdf, marcarEnviado } from './actions'
import { Button } from '@/components/Button'
import type { PdfClientPageProps } from './pdf-types'

type Fase = 'generando' | 'subiendo' | 'listo' | 'error'

export default function PdfClientPage({
  presupuestoId,
  tiendaId,
  pdfUrlInicial,
  numeroPdfInicial,
  signedUrlInicial,
  docProps,
}: PdfClientPageProps) {
  const router = useRouter()

  const [fase, setFase] = useState<Fase>(pdfUrlInicial ? 'listo' : 'generando')
  const [numeroPdf, setNumeroPdf] = useState<string | null>(numeroPdfInicial)
  const [signedUrl, setSignedUrl] = useState<string | null>(signedUrlInicial)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const finalizedRef = useRef(false)
  // Ref estable de docProps para usarlo en el effect sin añadirlo como dependencia.
  const docPropsRef = useRef(docProps)

  // Para el preview. El número se actualiza con updatePdf() una vez asignado.
  const [pdfInstance, updatePdf] = usePDF({
    document: (
      <PresupuestoPdfDoc
        {...docProps}
        numeroPdf={numeroPdf ?? docProps.numeroPdf}
      />
    ),
  })

  useEffect(() => {
    if (pdfUrlInicial || finalizedRef.current) return
    if (pdfInstance.loading || !pdfInstance.blob) return

    finalizedRef.current = true
    setFase('subiendo')

    void (async () => {
      const supabase = createClient()
      const pdfPath = `${tiendaId}/${presupuestoId}.pdf`

      // 1. Sube el blob inicial (placeholder con '---') para reservar la ruta.
      const { error: uploadErr } = await supabase.storage
        .from('pdfs')
        .upload(pdfPath, pdfInstance.blob!, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (uploadErr) {
        setErrorMsg(`Error al subir el PDF: ${uploadErr.message}`)
        setFase('error')
        return
      }

      // 2. Asigna número correlativo y obtiene signed URL (RPC + Storage admin).
      const result = await finalizarPdf(presupuestoId, pdfPath)
      if (!result.ok) {
        setErrorMsg(result.error)
        setFase('error')
        return
      }

      const { numeroPdf: numero, signedUrl: url } = result

      // 3. Regenera el blob con el número real usando la API programática.
      //    Esto evita que el PDF descargado o el enlace compartido tenga '---'.
      let finalBlob: Blob
      try {
        finalBlob = await renderPdf(
          <PresupuestoPdfDoc {...docPropsRef.current} numeroPdf={numero} />,
        ).toBlob()
      } catch {
        // Si falla la regeneración, el archivo en Storage tiene '---' pero
        // el número en BD es correcto. El usuario puede descargar via preview.
        setNumeroPdf(numero)
        setSignedUrl(url)
        updatePdf(<PresupuestoPdfDoc {...docPropsRef.current} numeroPdf={numero} />)
        setFase('listo')
        return
      }

      // 4. Sobreescribe Storage con el PDF correcto (número real).
      await supabase.storage
        .from('pdfs')
        .upload(pdfPath, finalBlob, {
          contentType: 'application/pdf',
          upsert: true,
        })

      // 5. Actualiza el preview del iframe con el PDF definitivo.
      updatePdf(<PresupuestoPdfDoc {...docPropsRef.current} numeroPdf={numero} />)

      setNumeroPdf(numero)
      setSignedUrl(url)
      setFase('listo')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfInstance.loading, pdfInstance.blob])

  function descargar() {
    if (!pdfInstance.url) return
    const a = document.createElement('a')
    a.href = pdfInstance.url
    a.download = `presupuesto-${numeroPdf ?? presupuestoId}.pdf`
    a.click()
  }

  async function copiarEnlace() {
    if (!signedUrl) return
    await navigator.clipboard.writeText(signedUrl)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  function mailtoUrl(): string {
    const asunto = encodeURIComponent(
      `Presupuesto ${numeroPdf ?? ''} — ${docProps.tienda.nombre}`,
    )
    const cuerpo = encodeURIComponent(
      [
        docProps.clienteNombre ? `Hola ${docProps.clienteNombre},` : 'Hola,',
        '',
        `Te enviamos el presupuesto ${numeroPdf ?? ''}.`,
        signedUrl ? `\nPuedes descargarlo aquí:\n${signedUrl}` : '',
        '',
        `Un saludo,\n${docProps.tienda.nombre}`,
      ]
        .join('\n')
        .trim(),
    )
    const to = docProps.clienteEmail ?? ''
    return `mailto:${to}?subject=${asunto}&body=${cuerpo}`
  }

  async function handleEnviarEmail() {
    window.location.href = mailtoUrl()
    setEnviando(true)
    await marcarEnviado(presupuestoId)
    setEnviando(false)
  }

  const listo = fase === 'listo'
  const cargando = fase === 'generando' || fase === 'subiendo'

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-main">
              {numeroPdf ? `Presupuesto ${numeroPdf}` : 'Generando presupuesto…'}
            </h1>
            {docProps.clienteNombre && (
              <p className="mt-1 text-sm text-text-muted">
                {docProps.clienteNombre}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="text-sm text-text-muted hover:text-text-main hover:underline"
          >
            ← Volver al dashboard
          </button>
        </header>

        {/* Banners de estado */}
        {cargando && (
          <p
            role="status"
            className="rounded-card border border-text-muted/20 bg-background px-4 py-3 text-sm text-text-muted"
          >
            {fase === 'generando'
              ? 'Generando el PDF…'
              : 'Subiendo el PDF y asignando número de presupuesto…'}
          </p>
        )}
        {fase === 'error' && errorMsg && (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {errorMsg}
          </p>
        )}
        {listo && (
          <p
            role="status"
            className="rounded-card border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
          >
            PDF generado — presupuesto {numeroPdf}.
          </p>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={descargar}
            disabled={!pdfInstance.url || !listo}
            loading={cargando}
          >
            Descargar PDF
          </Button>

          {/* NOTA: modificado respecto a docx sec 7 / Pantalla 5 —
              "Enviar por email (PDF adjunto)" implementado como mailto con la
              URL firmada en el cuerpo; el protocolo mailto no soporta adjuntos. */}
          <Button
            variant="secondary"
            disabled={!listo || enviando}
            loading={enviando}
            onClick={handleEnviarEmail}
          >
            Enviar por email
          </Button>

          <Button
            variant="secondary"
            disabled={!signedUrl || !listo}
            onClick={copiarEnlace}
          >
            {copiado ? '¡Enlace copiado!' : 'Copiar enlace'}
          </Button>

          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard')}
          >
            Volver al dashboard
          </Button>
        </div>

        {/* Vista previa del PDF */}
        <div className="overflow-hidden rounded-card shadow-card">
          {pdfInstance.url ? (
            <iframe
              src={pdfInstance.url}
              title="Vista previa del presupuesto"
              className="h-[75vh] w-full"
            />
          ) : (
            <div className="flex h-64 items-center justify-center bg-background text-sm text-text-muted">
              {pdfInstance.error
                ? `Error al renderizar el PDF: ${pdfInstance.error}`
                : 'Generando vista previa…'}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
