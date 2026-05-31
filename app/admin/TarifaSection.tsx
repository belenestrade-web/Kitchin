'use client';

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import {
  TIPOS_VALIDOS,
  type Tarifa,
  type TipoModulo,
} from '@/types/database';
import { actualizarPrecio, crearTarifa, toggleActivo } from './actions';
import ImportarCsv from './ImportarCsv';

const fmtEur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
});

const tipoLabel: Record<TipoModulo, string> = {
  bajo: 'Bajo',
  alto: 'Alto',
  columna: 'Columna',
  electrodomestico: 'Electrodom.',
  encimera: 'Encimera',
  accesorio: 'Accesorio',
  panel: 'Panel',
  zocalo: 'Zócalo',
};

function tipoOrden(t: TipoModulo): number {
  return TIPOS_VALIDOS.indexOf(t);
}

function ordenar(a: Tarifa, b: Tarifa): number {
  const t = tipoOrden(a.tipo) - tipoOrden(b.tipo);
  if (t !== 0) return t;
  return a.nombre_modulo.localeCompare(b.nombre_modulo, 'es');
}

interface Props {
  tarifasIniciales: Tarifa[];
}

export default function TarifaSection({ tarifasIniciales }: Props) {
  const [tarifas, setTarifas] = useState<Tarifa[]>(tarifasIniciales);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState<string>('');
  const [panel, setPanel] = useState<'none' | 'add' | 'import'>('none');
  const [, startTransition] = useTransition();

  function fusionarFinales(filas: Tarifa[]) {
    setTarifas((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      for (const f of filas) map.set(f.id, f);
      return Array.from(map.values()).sort(ordenar);
    });
  }

  function comenzarEdicion(t: Tarifa) {
    setError(null);
    setInfo(null);
    setEditandoId(t.id);
    setEditValor(String(t.precio).replace('.', ','));
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setEditValor('');
  }

  async function guardarEdicion(id: string) {
    const valor = editValor.trim();
    if (!valor) {
      cancelarEdicion();
      return;
    }
    const previo = tarifas;
    const numero = Number(valor.replace(',', '.'));
    if (!Number.isFinite(numero) || numero < 0) {
      setError('El precio debe ser un número ≥ 0.');
      return;
    }
    setTarifas(
      tarifas.map((t) => (t.id === id ? { ...t, precio: numero } : t))
    );
    setEditandoId(null);
    setEditValor('');

    startTransition(async () => {
      const result = await actualizarPrecio(id, valor);
      if (!result.ok) {
        setError(result.error);
        setTarifas(previo);
      } else {
        setInfo('Precio actualizado.');
      }
    });
  }

  function alternarActivo(t: Tarifa) {
    const previo = tarifas;
    const nuevoEstado = !t.activo;
    setTarifas(
      tarifas.map((x) => (x.id === t.id ? { ...x, activo: nuevoEstado } : x))
    );
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await toggleActivo(t.id, nuevoEstado);
      if (!result.ok) {
        setError(result.error);
        setTarifas(previo);
      }
    });
  }

  async function añadir(
    input: {
      nombre_modulo: string;
      tipo: TipoModulo;
      medida: string;
      precio: string;
    },
    onSuccess: () => void
  ) {
    setError(null);
    setInfo(null);
    const result = await crearTarifa(input);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTarifas([...tarifas, result.data].sort(ordenar));
    setInfo(`Añadido: ${result.data.nombre_modulo}.`);
    onSuccess();
  }

  function alAplicarImport(resultado: {
    insertadas: number;
    actualizadas: number;
    ignoradas: { numero: number; razon: string; nombre_modulo: string }[];
    filas_finales: Tarifa[];
  }) {
    fusionarFinales(resultado.filas_finales);
    const partes: string[] = [];
    if (resultado.insertadas > 0) partes.push(`${resultado.insertadas} insertadas`);
    if (resultado.actualizadas > 0)
      partes.push(`${resultado.actualizadas} actualizadas`);
    if (resultado.ignoradas.length > 0)
      partes.push(`${resultado.ignoradas.length} ignoradas`);
    setInfo(partes.length > 0 ? `Importación: ${partes.join(', ')}.` : null);
  }

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-text-muted/15 p-4 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Tarifa de precios
          </h2>
          <p className="mt-1 text-sm text-text-main">
            {tarifas.length === 0
              ? 'Tu tarifa está vacía. Añade el primer módulo.'
              : `${tarifas.length} módulos · ${tarifas.filter((t) => t.activo).length} activos`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={panel === 'add' ? 'ghost' : 'primary'}
            onClick={() => {
              setPanel(panel === 'add' ? 'none' : 'add');
              setError(null);
              setInfo(null);
            }}
          >
            {panel === 'add' ? 'Cancelar' : 'Añadir módulo'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPanel(panel === 'import' ? 'none' : 'import');
              setError(null);
              setInfo(null);
            }}
          >
            {panel === 'import' ? 'Cerrar import' : 'Importar CSV'}
          </Button>
        </div>
      </header>

      {panel === 'add' && (
        <FormularioAñadir
          onSubmit={(input, resetForm) =>
            añadir(input, () => {
              setPanel('none');
              resetForm();
            })
          }
          onCancel={() => setPanel('none')}
        />
      )}

      {panel === 'import' && (
        <ImportarCsv
          onCerrar={() => setPanel('none')}
          onAplicado={alAplicarImport}
        />
      )}

      {error && (
        <p
          role="alert"
          className="border-b border-danger/30 bg-danger/5 px-4 py-2 text-sm text-danger sm:px-6"
        >
          {error}
        </p>
      )}
      {info && !error && (
        <p
          role="status"
          className="border-b border-success/30 bg-success/5 px-4 py-2 text-sm text-success sm:px-6"
        >
          {info}
        </p>
      )}

      {tarifas.length === 0 ? (
        <div className="p-10 text-center text-text-muted">
          Sin módulos. Pulsa &quot;Añadir módulo&quot; para crear el primero.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-text-muted/15 text-left">
                <th className="px-4 py-3 font-medium text-text-muted">
                  Módulo
                </th>
                <th className="px-4 py-3 font-medium text-text-muted">Tipo</th>
                <th className="px-4 py-3 font-medium text-text-muted">
                  Medida
                </th>
                <th className="px-4 py-3 text-right font-medium text-text-muted">
                  Precio
                </th>
                <th className="px-4 py-3 text-center font-medium text-text-muted">
                  Activo
                </th>
              </tr>
            </thead>
            <tbody>
              {tarifas.map((t) => (
                <tr
                  key={t.id}
                  className={
                    'border-b border-text-muted/10 last:border-0 ' +
                    (t.activo ? '' : 'opacity-50')
                  }
                >
                  <td className="px-4 py-3 text-text-main">
                    {t.nombre_modulo}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {tipoLabel[t.tipo]}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {t.medida || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoId === t.id ? (
                      <CeldaEdicion
                        valor={editValor}
                        setValor={setEditValor}
                        onConfirm={() => guardarEdicion(t.id)}
                        onCancel={cancelarEdicion}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => comenzarEdicion(t)}
                        className="rounded px-2 py-1 text-text-main hover:bg-background"
                        title="Editar precio"
                      >
                        {fmtEur.format(Number(t.precio))}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SwitchActivo
                      activo={t.activo}
                      onChange={() => alternarActivo(t)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CeldaEdicion({
  valor,
  setValor,
  onConfirm,
  onCancel,
}: {
  valor: string;
  setValor: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      autoFocus
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={onConfirm}
      onKeyDown={onKeyDown}
      className="w-24 rounded border border-primary bg-card px-2 py-1 text-right text-sm text-text-main focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}

function SwitchActivo({
  activo,
  onChange,
}: {
  activo: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={onChange}
      className={
        'inline-flex h-5 w-9 items-center rounded-full transition-colors ' +
        (activo ? 'bg-success' : 'bg-text-muted/40')
      }
      title={activo ? 'Desactivar' : 'Activar'}
    >
      <span
        className={
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ' +
          (activo ? 'translate-x-4' : 'translate-x-0.5')
        }
      />
    </button>
  );
}

function FormularioAñadir({
  onSubmit,
  onCancel,
}: {
  onSubmit: (
    input: {
      nombre_modulo: string;
      tipo: TipoModulo;
      medida: string;
      precio: string;
    },
    resetForm: () => void
  ) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoModulo>('bajo');
  const [medida, setMedida] = useState('');
  const [precio, setPrecio] = useState('');
  const [enviando, setEnviando] = useState(false);

  function reset() {
    setNombre('');
    setTipo('bajo');
    setMedida('');
    setPrecio('');
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      await onSubmit(
        {
          nombre_modulo: nombre,
          tipo,
          medida,
          precio,
        },
        reset
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-3 border-b border-text-muted/15 bg-background/40 p-4 sm:grid-cols-12 sm:p-6"
    >
      <div className="sm:col-span-5">
        <label
          htmlFor="add-nombre"
          className="block text-xs font-medium text-text-muted"
        >
          Nombre
        </label>
        <input
          id="add-nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          placeholder="Módulo bajo 60cm 1 cajón"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-3">
        <label
          htmlFor="add-tipo"
          className="block text-xs font-medium text-text-muted"
        >
          Tipo
        </label>
        <select
          id="add-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoModulo)}
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {TIPOS_VALIDOS.map((t) => (
            <option key={t} value={t}>
              {tipoLabel[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label
          htmlFor="add-medida"
          className="block text-xs font-medium text-text-muted"
        >
          Medida
        </label>
        <input
          id="add-medida"
          type="text"
          value={medida}
          onChange={(e) => setMedida(e.target.value)}
          placeholder="60x72x60"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-2">
        <label
          htmlFor="add-precio"
          className="block text-xs font-medium text-text-muted"
        >
          Precio (€)
        </label>
        <input
          id="add-precio"
          type="text"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
          placeholder="185,00"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="flex items-end gap-2 sm:col-span-12">
        <Button type="submit" loading={enviando} disabled={enviando}>
          Guardar
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
