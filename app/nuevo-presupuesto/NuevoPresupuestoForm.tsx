'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { crearBorradorDesdePlano } from './actions';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NuevoPresupuestoForm() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const aceptarArchivo = useCallback((f: File | null | undefined) => {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError('Formato no admitido. Usa JPG, PNG, WEBP o PDF.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo supera el máximo de 20MB.');
      return;
    }
    setFile(f);
  }, []);

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    aceptarArchivo(e.target.files?.[0]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    aceptarArchivo(e.dataTransfer.files?.[0]);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
  }

  function limpiarArchivo() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file || submitting) return;
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    // Reemplazamos el campo del input por el File en estado: el input puede
    // haber quedado vacío si el archivo llegó por drag&drop.
    fd.set('file', file);

    try {
      const result = await crearBorradorDesdePlano(fd);
      if (result?.error) {
        setError(result.error);
        setSubmitting(false);
      }
      // Si todo fue bien, el action hace redirect() y nunca volvemos aquí.
    } catch (err) {
      // redirect() lanza una excepción interna de Next que Next captura por
      // su lado; cualquier error real que llegue aquí es de red/inesperado.
      if (err instanceof Error && err.message !== 'NEXT_REDIRECT') {
        setError('Error inesperado al subir el plano. Inténtalo de nuevo.');
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Datos del cliente
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Campo
            id="cliente_nombre"
            label="Nombre"
            type="text"
            autoComplete="name"
          />
          <Campo
            id="cliente_email"
            label="Email"
            type="email"
            autoComplete="email"
          />
          <Campo
            id="cliente_telefono"
            label="Teléfono"
            type="tel"
            autoComplete="tel"
          />
        </div>
        <p className="mt-3 text-xs text-text-muted">
          Todos los campos son opcionales. Puedes rellenarlos más tarde.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Plano de la cocina
        </h2>

        {!file ? (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Selecciona o arrastra el plano"
            className={[
              'flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed p-10 text-center transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-text-muted/30 hover:border-primary/60 hover:bg-background',
            ].join(' ')}
          >
            <p className="text-sm font-medium text-text-main">
              Arrastra el plano aquí o haz clic para seleccionarlo
            </p>
            <p className="mt-1 text-xs text-text-muted">
              JPG, PNG, WEBP o PDF · máx. 20MB
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-card border border-text-muted/20 bg-background sm:w-56">
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewUrl}
                  alt="Vista previa del plano"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="px-4 text-center text-xs text-text-muted">
                  <p className="text-3xl">📄</p>
                  <p className="mt-2">Sin vista previa</p>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-main">
                {file.name}
              </p>
              <p className="text-xs text-text-muted">
                {file.type || 'archivo'} · {formatSize(file.size)}
              </p>
              <button
                type="button"
                onClick={limpiarArchivo}
                className="mt-3 text-sm text-text-muted underline-offset-2 hover:text-text-main hover:underline"
              >
                Cambiar archivo
              </button>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          name="file"
          accept={ACCEPT_ATTR}
          onChange={onInputChange}
          className="sr-only"
        />
      </Card>

      {error && (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <a
          href="/dashboard"
          className="text-sm text-text-muted hover:text-text-main hover:underline"
        >
          ← Volver al dashboard
        </a>
        <Button
          type="submit"
          loading={submitting}
          disabled={!file}
          className="sm:px-8 sm:py-3 sm:text-base"
        >
          {submitting ? 'Subiendo plano…' : 'Analizar con IA'}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  id,
  label,
  type,
  autoComplete,
}: {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel';
  autoComplete?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-text-main"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2.5 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
