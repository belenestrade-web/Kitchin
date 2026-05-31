'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Button } from '@/components/Button';
import type { Tarifa } from '@/types/database';
import {
  aplicarImportacionTarifa,
  previsualizarImportacionTarifa,
} from './actions';

interface FilaCsv {
  numero: number;
  nombre_modulo: string;
  tipo: string;
  medida: string;
  precio: string;
}

interface FilaIgnorada {
  numero: number;
  razon: string;
  nombre_modulo: string;
}

interface PreviewResult {
  total_filas: number;
  a_insertar: number;
  a_actualizar: number;
  ignoradas: FilaIgnorada[];
}

interface AplicarResult {
  insertadas: number;
  actualizadas: number;
  ignoradas: FilaIgnorada[];
  filas_finales: Tarifa[];
}

type Fase =
  | { tipo: 'esperando-archivo' }
  | { tipo: 'parseando'; nombreArchivo: string }
  | {
      tipo: 'preview';
      nombreArchivo: string;
      rows: FilaCsv[];
      preview: PreviewResult;
    }
  | { tipo: 'aplicando'; nombreArchivo: string; rows: FilaCsv[] }
  | {
      tipo: 'completado';
      nombreArchivo: string;
      resultado: AplicarResult;
    }
  | { tipo: 'error'; mensaje: string; nombreArchivo?: string };

const COLUMNAS_REQUERIDAS = ['nombre_modulo', 'tipo', 'medida', 'precio'];

function parsearCsv(
  texto: string
): { ok: true; rows: FilaCsv[] } | { ok: false; error: string } {
  let t = texto;
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const tablaFilas: string[][] = [];
  let filaActual: string[] = [];
  let campo = '';
  let entreComillas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else {
      if (c === '"' && campo === '') {
        entreComillas = true;
      } else if (c === ',') {
        filaActual.push(campo);
        campo = '';
      } else if (c === '\n') {
        filaActual.push(campo);
        tablaFilas.push(filaActual);
        filaActual = [];
        campo = '';
      } else {
        campo += c;
      }
    }
  }
  if (campo.length > 0 || filaActual.length > 0) {
    filaActual.push(campo);
    tablaFilas.push(filaActual);
  }

  if (tablaFilas.length === 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }

  const header = tablaFilas[0].map((h) => h.trim());
  const faltan = COLUMNAS_REQUERIDAS.filter((k) => !header.includes(k));
  if (faltan.length > 0) {
    return {
      ok: false,
      error: `Faltan columnas obligatorias en el header: ${faltan.join(', ')}. Esperadas: ${COLUMNAS_REQUERIDAS.join(', ')}.`,
    };
  }

  const idx: Record<string, number> = {};
  for (const c of COLUMNAS_REQUERIDAS) idx[c] = header.indexOf(c);

  const rows: FilaCsv[] = [];
  for (let i = 1; i < tablaFilas.length; i++) {
    const fila = tablaFilas[i];
    if (fila.every((c) => c.trim() === '')) continue;
    rows.push({
      numero: i + 1,
      nombre_modulo: (fila[idx.nombre_modulo] ?? '').trim(),
      tipo: (fila[idx.tipo] ?? '').trim(),
      medida: (fila[idx.medida] ?? '').trim(),
      precio: (fila[idx.precio] ?? '').trim(),
    });
  }
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo no tiene filas de datos.' };
  }
  return { ok: true, rows };
}

interface Props {
  onCerrar: () => void;
  onAplicado: (resultado: AplicarResult) => void;
}

export default function ImportarCsv({ onCerrar, onAplicado }: Props) {
  const [fase, setFase] = useState<Fase>({ tipo: 'esperando-archivo' });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fase.tipo === 'esperando-archivo') {
      inputRef.current?.click();
    }
  }, [fase.tipo]);

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFase({ tipo: 'parseando', nombreArchivo: file.name });
    try {
      const texto = await file.text();
      const parsed = parsearCsv(texto);
      if (!parsed.ok) {
        setFase({ tipo: 'error', mensaje: parsed.error, nombreArchivo: file.name });
        return;
      }
      const result = await previsualizarImportacionTarifa(parsed.rows);
      if (!result.ok) {
        setFase({ tipo: 'error', mensaje: result.error, nombreArchivo: file.name });
        return;
      }
      setFase({
        tipo: 'preview',
        nombreArchivo: file.name,
        rows: parsed.rows,
        preview: {
          total_filas: result.data.total_filas,
          a_insertar: result.data.a_insertar,
          a_actualizar: result.data.a_actualizar,
          ignoradas: result.data.ignoradas,
        },
      });
    } catch (err) {
      setFase({
        tipo: 'error',
        mensaje: err instanceof Error ? err.message : 'Error leyendo el archivo.',
        nombreArchivo: file.name,
      });
    }
  }

  async function confirmar() {
    if (fase.tipo !== 'preview') return;
    const { rows, nombreArchivo } = fase;
    setFase({ tipo: 'aplicando', nombreArchivo, rows });
    const result = await aplicarImportacionTarifa(rows);
    if (!result.ok) {
      setFase({ tipo: 'error', mensaje: result.error, nombreArchivo });
      return;
    }
    setFase({
      tipo: 'completado',
      nombreArchivo,
      resultado: result.data,
    });
    onAplicado(result.data);
  }

  function elegirOtroArchivo() {
    setFase({ tipo: 'esperando-archivo' });
  }

  return (
    <div className="border-b border-text-muted/15 bg-background/40 p-4 sm:p-6">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileChange}
        className="sr-only"
      />

      {fase.tipo === 'esperando-archivo' && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-main">
            Selecciona un fichero CSV con columnas{' '}
            <code className="rounded bg-text-muted/10 px-1 py-0.5 text-xs">
              {COLUMNAS_REQUERIDAS.join(', ')}
            </code>
            .
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
            >
              Elegir archivo
            </Button>
            <Button type="button" variant="ghost" onClick={onCerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {fase.tipo === 'parseando' && (
        <p className="text-sm text-text-muted">
          Procesando <span className="font-medium">{fase.nombreArchivo}</span>…
        </p>
      )}

      {fase.tipo === 'preview' && (
        <PanelPreview
          nombreArchivo={fase.nombreArchivo}
          preview={fase.preview}
          onConfirmar={confirmar}
          onCancelar={onCerrar}
          onElegirOtro={elegirOtroArchivo}
        />
      )}

      {fase.tipo === 'aplicando' && (
        <p className="text-sm text-text-muted">
          Aplicando cambios de{' '}
          <span className="font-medium">{fase.nombreArchivo}</span> a la
          base de datos…
        </p>
      )}

      {fase.tipo === 'completado' && (
        <PanelResultado
          nombreArchivo={fase.nombreArchivo}
          resultado={fase.resultado}
          onCerrar={onCerrar}
          onOtraImportacion={elegirOtroArchivo}
        />
      )}

      {fase.tipo === 'error' && (
        <PanelError
          mensaje={fase.mensaje}
          nombreArchivo={fase.nombreArchivo}
          onReintentar={elegirOtroArchivo}
          onCerrar={onCerrar}
        />
      )}
    </div>
  );
}

function PanelPreview({
  nombreArchivo,
  preview,
  onConfirmar,
  onCancelar,
  onElegirOtro,
}: {
  nombreArchivo: string;
  preview: PreviewResult;
  onConfirmar: () => void;
  onCancelar: () => void;
  onElegirOtro: () => void;
}) {
  const totalProcesable = preview.a_insertar + preview.a_actualizar;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
          Vista previa
        </h3>
        <p className="mt-1 text-sm text-text-main">
          Fichero <span className="font-medium">{nombreArchivo}</span> ·{' '}
          {preview.total_filas} fila{preview.total_filas === 1 ? '' : 's'} de
          datos. Nada se ha escrito todavía. Revisa el desglose antes de
          confirmar.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Contador
          label="A insertar"
          value={preview.a_insertar}
          color="success"
        />
        <Contador
          label="A actualizar"
          value={preview.a_actualizar}
          color="warning"
        />
        <Contador
          label="Ignoradas"
          value={preview.ignoradas.length}
          color={preview.ignoradas.length > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {preview.ignoradas.length > 0 && (
        <TablaIgnoradas filas={preview.ignoradas} />
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onElegirOtro}>
          Elegir otro archivo
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={onConfirmar}
          disabled={totalProcesable === 0}
        >
          {totalProcesable === 0
            ? 'Nada que importar'
            : `Confirmar e importar ${totalProcesable} fila${totalProcesable === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}

function PanelResultado({
  nombreArchivo,
  resultado,
  onCerrar,
  onOtraImportacion,
}: {
  nombreArchivo: string;
  resultado: AplicarResult;
  onCerrar: () => void;
  onOtraImportacion: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-success">
          Importación completada
        </h3>
        <p className="mt-1 text-sm text-text-main">
          Fichero <span className="font-medium">{nombreArchivo}</span>.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Contador
          label="Insertadas"
          value={resultado.insertadas}
          color="success"
        />
        <Contador
          label="Actualizadas"
          value={resultado.actualizadas}
          color="warning"
        />
        <Contador
          label="Ignoradas"
          value={resultado.ignoradas.length}
          color={resultado.ignoradas.length > 0 ? 'danger' : 'neutral'}
        />
      </div>

      {resultado.ignoradas.length > 0 && (
        <TablaIgnoradas filas={resultado.ignoradas} />
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onOtraImportacion}>
          Importar otro archivo
        </Button>
        <Button type="button" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function PanelError({
  mensaje,
  nombreArchivo,
  onReintentar,
  onCerrar,
}: {
  mensaje: string;
  nombreArchivo?: string;
  onReintentar: () => void;
  onCerrar: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        {nombreArchivo ? `${nombreArchivo}: ` : ''}
        {mensaje}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button type="button" onClick={onReintentar}>
          Elegir otro archivo
        </Button>
      </div>
    </div>
  );
}

function Contador({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const colorClass =
    color === 'success'
      ? 'text-success'
      : color === 'warning'
        ? 'text-warning'
        : color === 'danger'
          ? 'text-danger'
          : 'text-text-main';
  return (
    <div className="rounded-card border border-text-muted/15 bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

function TablaIgnoradas({ filas }: { filas: FilaIgnorada[] }) {
  return (
    <div className="rounded-card border border-danger/30 bg-danger/5">
      <p className="border-b border-danger/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-danger">
        Filas ignoradas ({filas.length})
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="px-3 py-2 font-medium text-text-muted">Fila</th>
              <th className="px-3 py-2 font-medium text-text-muted">
                Nombre módulo
              </th>
              <th className="px-3 py-2 font-medium text-text-muted">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, idx) => (
              <tr
                key={`${f.numero}-${idx}`}
                className="border-t border-danger/10"
              >
                <td className="px-3 py-2 align-top text-text-main">
                  {f.numero}
                </td>
                <td className="px-3 py-2 align-top text-text-main">
                  {f.nombre_modulo || (
                    <span className="italic text-text-muted">(vacío)</span>
                  )}
                </td>
                <td className="px-3 py-2 align-top text-danger">{f.razon}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
