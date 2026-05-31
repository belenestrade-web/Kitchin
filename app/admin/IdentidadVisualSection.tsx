'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { actualizarTienda } from './actions';

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

interface Props {
  tiendaId: string;
  nombre: string;
  emailContacto: string | null;
  telefono: string | null;
  direccion: string | null;
  colorPrimario: string;
  condicionesComerciales: string | null;
  logoPath: string | null;        // path en Storage, ej: "{tiendaId}/logo"
  logoPublicUrl: string | null;   // URL pública para el <img> de preview
}

interface Campos {
  nombre: string;
  email_contacto: string;
  telefono: string;
  direccion: string;
  color_primario: string;
  condiciones_comerciales: string;
}

function inputClass(extra = '') {
  return [
    'w-full rounded-card border border-text-muted/30 bg-card px-3 py-2',
    'text-sm text-text-main placeholder:text-text-muted',
    'focus:outline-none focus:ring-2 focus:ring-primary',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

export default function IdentidadVisualSection({
  tiendaId,
  nombre,
  emailContacto,
  telefono,
  direccion,
  colorPrimario,
  condicionesComerciales,
  logoPath,
  logoPublicUrl,
}: Props) {
  const iniciales: Campos = {
    nombre,
    email_contacto: emailContacto ?? '',
    telefono: telefono ?? '',
    direccion: direccion ?? '',
    color_primario: colorPrimario,
    condiciones_comerciales: condicionesComerciales ?? '',
  };

  // Ref de los valores ya persistidos en BD, para calcular dirty y revertir.
  const savedRef = useRef<Campos & { logoPath: string | null }>({
    ...iniciales,
    logoPath,
  });

  const [campos, setCampos] = useState<Campos>(iniciales);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoPublicUrl);
  const [logoPathActual, setLogoPathActual] = useState<string | null>(logoPath);
  const [logoSubiendo, setLogoSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () =>
      campos.nombre !== savedRef.current.nombre ||
      campos.email_contacto !== savedRef.current.email_contacto ||
      campos.telefono !== savedRef.current.telefono ||
      campos.direccion !== savedRef.current.direccion ||
      campos.color_primario !== savedRef.current.color_primario ||
      campos.condiciones_comerciales !== savedRef.current.condiciones_comerciales,
    [campos],
  );

  function set(campo: keyof Campos, valor: string) {
    setError(null);
    setInfo(null);
    setCampos((prev) => ({ ...prev, [campo]: valor }));
  }

  async function handleLogoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // permite re-seleccionar el mismo archivo

    if (!TIPOS_IMAGEN.includes(file.type)) {
      setError('Solo se admiten imágenes PNG, JPG, WEBP o SVG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('El logo no puede superar 2 MB.');
      return;
    }

    setError(null);
    setInfo(null);
    setLogoSubiendo(true);

    const blobUrl = URL.createObjectURL(file);
    const prevPreview = logoPreview;
    setLogoPreview(blobUrl);

    try {
      const supabase = createClient();
      // Siempre la misma ruta — upsert sobreescribe el logo anterior.
      const storagePath = `${tiendaId}/logo`;

      const { error: uploadErr } = await supabase.storage
        .from('logos')
        .upload(storagePath, file, { contentType: file.type, upsert: true });

      if (uploadErr) {
        URL.revokeObjectURL(blobUrl);
        setLogoPreview(prevPreview);
        setError(`Error al subir el logo: ${uploadErr.message}`);
        return;
      }

      // Logo subido: persistir en BD junto con los campos de texto actuales.
      const result = await actualizarTienda({ ...campos, logo_url: storagePath });
      if (!result.ok) {
        URL.revokeObjectURL(blobUrl);
        setLogoPreview(prevPreview);
        setError(result.error);
        return;
      }

      // Sustituye blob URL temporal por la URL pública definitiva.
      const { data: pub } = supabase.storage
        .from('logos')
        .getPublicUrl(storagePath);
      URL.revokeObjectURL(blobUrl);
      setLogoPreview(pub.publicUrl);
      setLogoPathActual(storagePath);
      // Marca campos de texto como guardados también (el SA los guardó junto al logo).
      savedRef.current = { ...campos, logoPath: storagePath };
      setInfo('Logo actualizado.');
    } catch (err) {
      URL.revokeObjectURL(blobUrl);
      setLogoPreview(prevPreview);
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLogoSubiendo(false);
    }
  }

  function guardar() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      // logo_url se omite aquí: el logo se guarda exclusivamente al hacer upload,
      // no al pulsar "Guardar cambios" (evita sobreescribir con path obsoleto).
      const result = await actualizarTienda({ ...campos });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      savedRef.current = { ...campos, logoPath: logoPathActual };
      setInfo('Cambios guardados.');
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Identidad visual ─────────────────────────────────── */}
      <Card className="space-y-6 p-6">
        <h2 className="text-base font-semibold text-text-main">
          Identidad visual
        </h2>

        {/* Logo */}
        <div>
          <p className="mb-2 text-sm font-medium text-text-main">Logo</p>
          <div className="flex items-start gap-4">
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-card border border-text-muted/20 bg-background">
              {logoSubiendo ? (
                <div className="flex h-full w-full items-center justify-center">
                  <svg
                    className="h-5 w-5 animate-spin text-text-muted"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <circle
                      cx="12" cy="12" r="10"
                      stroke="currentColor" strokeOpacity="0.25" strokeWidth="4"
                    />
                    <path
                      d="M22 12a10 10 0 0 1-10 10"
                      stroke="currentColor" strokeWidth="4" strokeLinecap="round"
                    />
                  </svg>
                </div>
              ) : logoPreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={logoPreview}
                  alt="Logo actual"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
                  Sin logo
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={logoSubiendo}
                loading={logoSubiendo}
              >
                {logoPreview ? 'Cambiar logo' : 'Subir logo'}
              </Button>
              <p className="text-xs text-text-muted">PNG · JPG · WEBP · SVG · máx. 2 MB</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoSelect}
            />
          </div>
        </div>

        {/* Nombre + Color primario */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="tienda-nombre"
              className="mb-1 block text-sm font-medium text-text-main"
            >
              Nombre de la tienda{' '}
              <span className="text-danger" aria-hidden>*</span>
            </label>
            <input
              id="tienda-nombre"
              type="text"
              value={campos.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              maxLength={200}
              className={inputClass()}
            />
          </div>

          <div>
            <label
              htmlFor="tienda-color"
              className="mb-1 block text-sm font-medium text-text-main"
            >
              Color primario
            </label>
            <div className="flex items-center gap-2">
              <input
                id="tienda-color"
                type="color"
                value={HEX_RE.test(campos.color_primario) ? campos.color_primario : '#1E5FA8'}
                onChange={(e) => set('color_primario', e.target.value)}
                className="h-9 w-9 cursor-pointer rounded border border-text-muted/30 p-0.5"
                title="Selector de color"
              />
              <input
                type="text"
                value={campos.color_primario}
                onChange={(e) => set('color_primario', e.target.value)}
                maxLength={7}
                placeholder="#1E5FA8"
                className={inputClass('w-28 font-mono')}
                aria-label="Valor hexadecimal del color"
              />
            </div>
          </div>
        </div>

        {/* Email + Teléfono */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="tienda-email"
              className="mb-1 block text-sm font-medium text-text-main"
            >
              Email de contacto
            </label>
            <input
              id="tienda-email"
              type="email"
              value={campos.email_contacto}
              onChange={(e) => set('email_contacto', e.target.value)}
              maxLength={200}
              placeholder="contacto@mitienda.com"
              className={inputClass()}
            />
          </div>

          <div>
            <label
              htmlFor="tienda-tel"
              className="mb-1 block text-sm font-medium text-text-main"
            >
              Teléfono
            </label>
            <input
              id="tienda-tel"
              type="tel"
              value={campos.telefono}
              onChange={(e) => set('telefono', e.target.value)}
              maxLength={50}
              placeholder="+34 600 000 000"
              className={inputClass()}
            />
          </div>
        </div>

        {/* Dirección */}
        <div>
          <label
            htmlFor="tienda-dir"
            className="mb-1 block text-sm font-medium text-text-main"
          >
            Dirección
          </label>
          <input
            id="tienda-dir"
            type="text"
            value={campos.direccion}
            onChange={(e) => set('direccion', e.target.value)}
            maxLength={500}
            placeholder="Calle Mayor 1, 28001 Madrid"
            className={inputClass()}
          />
        </div>
      </Card>

      {/* ── Condiciones comerciales ───────────────────────────── */}
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-base font-semibold text-text-main">
            Condiciones comerciales
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Aparece al pie del PDF de cada presupuesto.
          </p>
        </div>
        <textarea
          value={campos.condiciones_comerciales}
          onChange={(e) => set('condiciones_comerciales', e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="Validez del presupuesto: 30 días. Los precios incluyen montaje e instalación..."
          className={inputClass('resize-y')}
        />
        <p className="text-right text-xs text-text-muted">
          {campos.condiciones_comerciales.length} / 5000
        </p>
      </Card>

      {/* ── Banners ──────────────────────────────────────────── */}
      {error && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      {info && !error && (
        <p
          role="status"
          className="rounded-card border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
        >
          {info}
        </p>
      )}

      {/* ── Botón guardar (campos de texto) ──────────────────── */}
      <div className="flex justify-end">
        <Button
          onClick={guardar}
          loading={isPending}
          disabled={!dirty || isPending}
          variant={dirty ? 'primary' : 'ghost'}
        >
          {isPending ? 'Guardando…' : dirty ? 'Guardar cambios' : 'Sin cambios'}
        </Button>
      </div>
    </div>
  );
}
