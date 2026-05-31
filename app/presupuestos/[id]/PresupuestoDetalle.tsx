'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import {
  TIPOS_VALIDOS,
  type LineaCruzada,
  type LineaPresupuesto,
  type RespuestaAnalisisCruzado,
  type TipoModulo,
} from '@/types/database';
import { guardarLineas } from './actions';

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

const MAX_RONDAS = 5;
const MAX_RESPUESTA_CHARS = 2000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function nuevoClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

interface LineaTrabajo {
  clientId: string;
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  descripcion: string;
  unidades: number;
  precio_unitario: number;
  subtotal: number;
  editado_manualmente: boolean;
}

function desdeBd(l: LineaPresupuesto): LineaTrabajo {
  return {
    clientId: l.id,
    nombre_modulo: l.nombre_modulo,
    tipo: l.tipo,
    medida: l.medida ?? '',
    descripcion: l.descripcion ?? '',
    unidades: l.unidades,
    precio_unitario: Number(l.precio_unitario),
    subtotal: Number(l.subtotal),
    editado_manualmente: l.editado_manualmente,
  };
}

function desdeIa(l: LineaCruzada): LineaTrabajo {
  return {
    clientId: nuevoClientId(),
    nombre_modulo: l.nombre_modulo,
    tipo: l.tipo,
    medida: l.medida,
    descripcion: l.descripcion,
    unidades: l.unidades,
    precio_unitario: l.precio_unitario,
    subtotal: l.subtotal,
    editado_manualmente: l.editado_manualmente,
  };
}

interface Props {
  presupuestoId: string;
  ivaPorcentaje: number;
  notasIniciales: string | null;
  planoUrl: string | null;
  lineasIniciales: LineaPresupuesto[];
}

type EstadoError =
  | { tipo: 'cooldown'; mensaje: string }
  | { tipo: 'fallo'; mensaje: string }
  | null;

interface Snapshot {
  lineas: LineaTrabajo[];
  pregunta: string | null;
  rondas: number;
  dirty: boolean;
}

type EditingState = {
  clientId: string;
  campo: 'unidades' | 'precio_unitario';
  valor: string;
} | null;

interface MedidasCocina {
  paredes: string[];
  isla: boolean;
  islaLongitud: string;
  islaAncho: string;
  altoTecho: string;
  profundidad_bajos: string;
  profundidad_altos: string;
}

export default function PresupuestoDetalle({
  presupuestoId,
  ivaPorcentaje,
  notasIniciales,
  planoUrl,
  lineasIniciales,
}: Props) {
  const router = useRouter();
  const lineasInicialesTrabajo = useMemo(
    () => lineasIniciales.map(desdeBd),
    [lineasIniciales]
  );
  const [lineas, setLineas] = useState<LineaTrabajo[]>(lineasInicialesTrabajo);
  const [dirty, setDirty] = useState(false);

  const [pregunta, setPregunta] = useState<string | null>(notasIniciales);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<EstadoError>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [analizadoUnaVez, setAnalizadoUnaVez] = useState(false);
  const [rondasAclaracion, setRondasAclaracion] = useState(0);
  const [respuestaActual, setRespuestaActual] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const [editing, setEditing] = useState<EditingState>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [formAddOpen, setFormAddOpen] = useState(false);
  const [modalReanalizar, setModalReanalizar] = useState(false);

  const [medidas, setMedidas] = useState<MedidasCocina>({
    paredes: [''],
    isla: false,
    islaLongitud: '',
    islaAncho: '',
    altoTecho: '',
    profundidad_bajos: '',
    profundidad_altos: '',
  });
  const [medidasConfirmadas, setMedidasConfirmadas] = useState(false);
  const [formMedidasOpen, setFormMedidasOpen] = useState(false);

  // beforeunload solo si hay cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function marcarDirty() {
    setDirty(true);
    setInfo(null);
  }

  async function llamarApiAnalisis(
    body: Record<string, unknown>
  ): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch('/api/analizar-plano', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let mensaje = 'Error inesperado al analizar el plano.';
        try {
          const errBody = (await res.json()) as { error?: unknown };
          if (typeof errBody.error === 'string') mensaje = errBody.error;
        } catch {
          // genérico
        }
        setError({
          tipo: res.status === 429 ? 'cooldown' : 'fallo',
          mensaje,
        });
        return false;
      }
      const data = (await res.json()) as RespuestaAnalisisCruzado;
      const nuevasLineas = Array.isArray(data.modulos)
        ? data.modulos.map(desdeIa)
        : [];
      setLineas(nuevasLineas);
      setPregunta(data.pregunta ?? null);
      setAnalizadoUnaVez(true);
      // El análisis IA fresco siempre marca dirty (las nuevas líneas aún
      // no están en BD).
      setDirty(true);
      return true;
    } catch (err) {
      setError({
        tipo: 'fallo',
        mensaje:
          err instanceof Error
            ? err.message
            : 'Error de red al llamar a la IA.',
      });
      return false;
    }
  }

  function pedirAnalisis() {
    if (analizando || guardando) return;
    if (!medidasConfirmadas) {
      setFormMedidasOpen(true);
      return;
    }
    // Si hay líneas en pantalla (memoria o BD), confirmar antes de reemplazar.
    if (lineas.length > 0) {
      setModalReanalizar(true);
      return;
    }
    void ejecutarAnalisis();
  }

  async function ejecutarAnalisis() {
    setAnalizando(true);
    setSnapshot(null);
    setRondasAclaracion(0);
    setRespuestaActual('');
    setEditing(null);
    setEliminandoId(null);
    try {
      await llamarApiAnalisis({ presupuesto_id: presupuestoId, medidas });
    } finally {
      setAnalizando(false);
    }
  }

  function confirmarReanalizar() {
    setModalReanalizar(false);
    void ejecutarAnalisis();
  }

  async function responder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (analizando) return;
    const respuesta = respuestaActual.trim();
    if (!respuesta || !pregunta || rondasAclaracion >= MAX_RONDAS) return;

    setAnalizando(true);
    setSnapshot({
      lineas,
      pregunta,
      rondas: rondasAclaracion,
      dirty,
    });
    const ok = await llamarApiAnalisis({
      presupuesto_id: presupuestoId,
      respuesta,
      pregunta_previa: pregunta,
    });
    if (ok) {
      setRondasAclaracion((r) => r + 1);
      setRespuestaActual('');
    } else {
      setSnapshot(null);
    }
    setAnalizando(false);
  }

  function restaurar() {
    if (!snapshot) return;
    setLineas(snapshot.lineas);
    setPregunta(snapshot.pregunta);
    setRondasAclaracion(snapshot.rondas);
    setDirty(snapshot.dirty);
    setRespuestaActual('');
    setSnapshot(null);
    setError(null);
  }

  // -------------------------------------------------------------------
  // Edición inline de celdas
  // -------------------------------------------------------------------

  function iniciarEdit(
    linea: LineaTrabajo,
    campo: 'unidades' | 'precio_unitario'
  ) {
    setError(null);
    setInfo(null);
    const valorActual =
      campo === 'unidades'
        ? String(linea.unidades)
        : String(linea.precio_unitario).replace('.', ',');
    setEditing({ clientId: linea.clientId, campo, valor: valorActual });
  }

  function cancelarEdit() {
    setEditing(null);
  }

  function commitEdit() {
    if (!editing) return;
    const valorRaw = editing.valor.trim();
    if (!valorRaw) {
      cancelarEdit();
      return;
    }
    if (editing.campo === 'unidades') {
      const num = Number(valorRaw);
      if (!Number.isInteger(num) || num < 1) {
        setError({
          tipo: 'fallo',
          mensaje: 'Las unidades deben ser un entero ≥ 1.',
        });
        return;
      }
      setLineas((prev) =>
        prev.map((l) =>
          l.clientId === editing.clientId
            ? {
                ...l,
                unidades: num,
                subtotal: round2(num * l.precio_unitario),
                // Editar unidades NO cambia editado_manualmente.
              }
            : l
        )
      );
    } else {
      const num = Number(valorRaw.replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) {
        setError({
          tipo: 'fallo',
          mensaje: 'El precio debe ser un número ≥ 0.',
        });
        return;
      }
      const precio = round2(num);
      setLineas((prev) =>
        prev.map((l) =>
          l.clientId === editing.clientId
            ? {
                ...l,
                precio_unitario: precio,
                subtotal: round2(l.unidades * precio),
                // Editar el precio SÍ marca editado_manualmente=true.
                editado_manualmente: true,
              }
            : l
        )
      );
    }
    setEditing(null);
    marcarDirty();
  }

  // -------------------------------------------------------------------
  // Añadir / Eliminar
  // -------------------------------------------------------------------

  function pedirEliminar(clientId: string) {
    setEliminandoId(clientId);
    setEditing(null);
    setError(null);
    setInfo(null);
  }

  function confirmarEliminar(clientId: string) {
    setLineas((prev) => prev.filter((l) => l.clientId !== clientId));
    setEliminandoId(null);
    marcarDirty();
  }

  function añadirLinea(input: {
    nombre_modulo: string;
    tipo: TipoModulo;
    medida: string;
    descripcion: string;
    unidades: number;
    precio_unitario: number;
  }) {
    const nueva: LineaTrabajo = {
      clientId: nuevoClientId(),
      nombre_modulo: input.nombre_modulo.trim(),
      tipo: input.tipo,
      medida: input.medida.trim(),
      descripcion: input.descripcion.trim(),
      unidades: input.unidades,
      precio_unitario: round2(input.precio_unitario),
      subtotal: round2(input.unidades * input.precio_unitario),
      // Manual → editado_manualmente=true por convención (Paso 11 decisión 3).
      editado_manualmente: true,
    };
    setLineas((prev) => [...prev, nueva]);
    setFormAddOpen(false);
    marcarDirty();
  }

  // -------------------------------------------------------------------
  // Guardar borrador
  // -------------------------------------------------------------------

  async function guardar() {
    if (guardando || analizando) return;
    setGuardando(true);
    setError(null);
    setInfo(null);
    try {
      const payload = lineas.map((l) => ({
        nombre_modulo: l.nombre_modulo,
        tipo: l.tipo,
        medida: l.medida,
        descripcion: l.descripcion,
        unidades: l.unidades,
        precio_unitario: l.precio_unitario,
        editado_manualmente: l.editado_manualmente,
      }));
      const result = await guardarLineas(presupuestoId, payload);
      if (!result.ok) {
        setError({ tipo: 'fallo', mensaje: result.error });
        return;
      }
      setDirty(false);
      setInfo(
        `Borrador guardado: ${result.data.lineas_count} línea${
          result.data.lineas_count === 1 ? '' : 's'
        }, total ${fmtEur.format(result.data.total_bruto)}.`
      );
    } finally {
      setGuardando(false);
    }
  }

  // -------------------------------------------------------------------
  // Totales (cliente: preview)
  // -------------------------------------------------------------------

  const totalUnidades = lineas.reduce((acc, l) => acc + l.unidades, 0);
  const totalNeto = round2(lineas.reduce((acc, l) => acc + l.subtotal, 0));
  const totalIva = round2((totalNeto * ivaPorcentaje) / 100);
  const totalBruto = round2(totalNeto + totalIva);
  const sinPrecioCount = lineas.filter((m) => m.editado_manualmente).length;

  const mensajeAccion = analizando
    ? 'Analizando el plano. La IA tarda entre 15 y 25 segundos.'
    : lineas.length === 0
      ? 'Aún no has analizado el plano. Pulsa "Analizar con IA" o "Añadir línea" para empezar.'
      : sinPrecioCount > 0
        ? `${lineas.length} línea${lineas.length === 1 ? '' : 's'} (${totalUnidades} módulo${totalUnidades === 1 ? '' : 's'}). ${sinPrecioCount} sin precio o editadas manualmente — revisa las marcadas.`
        : `${lineas.length} línea${lineas.length === 1 ? '' : 's'} (${totalUnidades} módulo${totalUnidades === 1 ? '' : 's'}). Todos los precios provenientes de la tarifa.`;

  const puedeResponder = rondasAclaracion < MAX_RONDAS;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
            Análisis del plano
          </h2>
          <p className="mt-1 text-sm text-text-main">{mensajeAccion}</p>
        </div>
        <Button
          onClick={pedirAnalisis}
          loading={analizando}
          disabled={analizando || guardando}
          className="sm:px-6"
        >
          {analizando
            ? 'Analizando…'
            : analizadoUnaVez || lineas.length > 0
              ? 'Re-analizar'
              : 'Analizar con IA'}
        </Button>
      </Card>

      {formMedidasOpen && !medidasConfirmadas && (
        <FormularioMedidas
          medidas={medidas}
          onChange={setMedidas}
          onConfirmar={() => {
            setMedidasConfirmadas(true);
            setFormMedidasOpen(false);
            void ejecutarAnalisis();
          }}
          onCancelar={() => setFormMedidasOpen(false)}
        />
      )}

      {error && (
        <p
          role="alert"
          className={
            error.tipo === 'cooldown'
              ? 'rounded-card border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning'
              : 'rounded-card border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger'
          }
        >
          {error.mensaje}
        </p>
      )}

      {info && !error && (
        <p
          role="status"
          className="rounded-card border border-success/30 bg-success/5 px-3 py-2 text-sm text-success"
        >
          {info}
        </p>
      )}

      {/* NOTA: modificado respecto a docx sec 4 (Pantalla 4a · ubicación). */}
      {pregunta && (
        <BloqueAclaracion
          pregunta={pregunta}
          planoUrl={planoUrl}
          rondaActual={rondasAclaracion + 1}
          puedeResponder={puedeResponder}
          respuesta={respuestaActual}
          setRespuesta={setRespuestaActual}
          onSubmit={responder}
          enviando={analizando}
        />
      )}

      {snapshot && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={restaurar}
            className="text-xs text-text-muted underline-offset-2 hover:text-text-main hover:underline"
            title="Restaura las líneas y la pregunta tal y como estaban antes de tu última respuesta."
          >
            ← Volver al análisis anterior
          </button>
        </div>
      )}

      {dirty && (
        <p
          role="status"
          className="rounded-card border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning"
        >
          Tienes cambios sin guardar. Pulsa &quot;Guardar borrador&quot; para
          persistirlos en Supabase.
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica label="Módulos" value={String(totalUnidades)} />
        <Metrica label="Total neto" value={fmtEur.format(totalNeto)} />
        <Metrica
          label={`IVA (${ivaPorcentaje}%)`}
          value={fmtEur.format(totalIva)}
        />
        <Metrica label="Total bruto" value={fmtEur.format(totalBruto)} />
      </section>

      <Card className="overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-text-muted/15 p-4 sm:p-6">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
              Líneas del presupuesto
            </h3>
            <p className="mt-1 text-xs text-text-muted">
              Toca o haz clic sobre Uds. o Precio para editar.
              <span className="hidden sm:inline"> Enter guarda, Esc cancela.</span>
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant={formAddOpen ? 'ghost' : 'secondary'}
              onClick={() => setFormAddOpen((v) => !v)}
              disabled={guardando || analizando}
              className="w-full sm:w-auto"
            >
              {formAddOpen ? 'Cancelar' : 'Añadir línea'}
            </Button>
            <Button
              type="button"
              variant={dirty ? 'primary' : 'ghost'}
              loading={guardando}
              disabled={!dirty || guardando || analizando}
              onClick={guardar}
              className="w-full sm:w-auto"
            >
              {guardando
                ? 'Guardando…'
                : dirty
                  ? 'Guardar borrador'
                  : 'Borrador guardado'}
            </Button>
            <Button
              type="button"
              variant={!dirty && lineas.length > 0 ? 'primary' : 'secondary'}
              disabled={dirty || lineas.length === 0 || guardando || analizando}
              onClick={() =>
                router.push(`/presupuestos/${presupuestoId}/pdf`)
              }
              title={
                dirty
                  ? 'Guarda el borrador antes de generar el PDF'
                  : lineas.length === 0
                    ? 'Añade al menos una línea para generar el PDF'
                    : undefined
              }
              className="w-full sm:w-auto"
            >
              Generar PDF y enviar
            </Button>
          </div>
        </header>

        {formAddOpen && (
          <FormularioAñadir
            onSubmit={añadirLinea}
            onCancel={() => setFormAddOpen(false)}
          />
        )}

        {lineas.length === 0 ? (
          <div className="p-10 text-center text-text-muted">
            <p className="text-text-main">Sin líneas todavía.</p>
            <p className="mt-1 text-sm">
              Analiza el plano con la IA o añade módulos manualmente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-text-muted/15 text-left">
                  <th className="px-4 py-3 font-medium text-text-muted">
                    Módulo
                  </th>
                  <th className="px-4 py-3 font-medium text-text-muted">
                    Tipo
                  </th>
                  <th className="px-4 py-3 font-medium text-text-muted">
                    Medida
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-text-muted">
                    Uds.
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-text-muted">
                    Precio unit.
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-text-muted">
                    Subtotal
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-text-muted">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((linea) =>
                  eliminandoId === linea.clientId ? (
                    <FilaConfirmEliminar
                      key={linea.clientId}
                      linea={linea}
                      onConfirmar={() => confirmarEliminar(linea.clientId)}
                      onCancelar={() => setEliminandoId(null)}
                    />
                  ) : (
                    <FilaLinea
                      key={linea.clientId}
                      linea={linea}
                      editing={editing}
                      onIniciarEdit={iniciarEdit}
                      onChangeEditing={(v) =>
                        setEditing((e) => (e ? { ...e, valor: v } : e))
                      }
                      onCommitEdit={commitEdit}
                      onCancelarEdit={cancelarEdit}
                      onPedirEliminar={() => pedirEliminar(linea.clientId)}
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalReanalizar && (
        <ModalConfirmar
          titulo="Reemplazar análisis"
          mensaje={`Vas a reemplazar las ${lineas.length} línea${lineas.length === 1 ? '' : 's'} actuales en pantalla con un nuevo análisis de la IA.${dirty ? ' Los cambios sin guardar se perderán.' : ' Las líneas guardadas en BD no se borrarán hasta que pulses "Guardar borrador" con el nuevo análisis.'} ¿Continuar?`}
          textoConfirmar="Sí, reanalizar"
          variante="primary"
          onConfirmar={confirmarReanalizar}
          onCancelar={() => setModalReanalizar(false)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// Sub-componentes
// ===========================================================================

function FilaLinea({
  linea,
  editing,
  onIniciarEdit,
  onChangeEditing,
  onCommitEdit,
  onCancelarEdit,
  onPedirEliminar,
}: {
  linea: LineaTrabajo;
  editing: EditingState;
  onIniciarEdit: (
    l: LineaTrabajo,
    campo: 'unidades' | 'precio_unitario'
  ) => void;
  onChangeEditing: (v: string) => void;
  onCommitEdit: () => void;
  onCancelarEdit: () => void;
  onPedirEliminar: () => void;
}) {
  const sinPrecio = linea.editado_manualmente;
  const editandoUds =
    editing?.clientId === linea.clientId && editing.campo === 'unidades';
  const editandoPrecio =
    editing?.clientId === linea.clientId && editing.campo === 'precio_unitario';

  return (
    <tr
      className={
        sinPrecio
          ? 'border-b border-text-muted/10 border-l-2 border-l-warning bg-warning/5 last:border-b-0'
          : 'border-b border-text-muted/10 last:border-0'
      }
    >
      <td className="px-4 py-3 text-text-main">
        <div className="font-medium">{linea.nombre_modulo}</div>
        {sinPrecio && (
          <span
            className="mt-1 inline-block rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning"
            title="Esta línea fue añadida manualmente o tiene el precio editado."
          >
            Editada manualmente
          </span>
        )}
        {linea.descripcion && (
          <div className="text-xs text-text-muted">{linea.descripcion}</div>
        )}
      </td>
      <td className="px-4 py-3 text-text-muted">{tipoLabel[linea.tipo]}</td>
      <td className="px-4 py-3 text-text-muted">{linea.medida || '—'}</td>

      <td className="px-4 py-3 text-right">
        {editandoUds ? (
          <CeldaEdicion
            valor={editing?.valor ?? ''}
            ancho="w-16"
            onChange={onChangeEditing}
            onConfirm={onCommitEdit}
            onCancel={onCancelarEdit}
          />
        ) : (
          <button
            type="button"
            onClick={() => onIniciarEdit(linea, 'unidades')}
            className="rounded px-2 py-1 text-text-main hover:bg-background"
            title="Editar unidades"
          >
            {linea.unidades}
          </button>
        )}
      </td>

      <td className="px-4 py-3 text-right">
        {editandoPrecio ? (
          <CeldaEdicion
            valor={editing?.valor ?? ''}
            ancho="w-24"
            onChange={onChangeEditing}
            onConfirm={onCommitEdit}
            onCancel={onCancelarEdit}
          />
        ) : (
          <button
            type="button"
            onClick={() => onIniciarEdit(linea, 'precio_unitario')}
            className={
              'rounded px-2 py-1 hover:bg-background ' +
              (sinPrecio ? 'text-warning' : 'text-text-main')
            }
            title="Editar precio unitario"
          >
            {fmtEur.format(linea.precio_unitario)}
          </button>
        )}
      </td>

      <td
        className={
          'px-4 py-3 text-right ' +
          (sinPrecio ? 'text-warning' : 'text-text-main')
        }
      >
        {fmtEur.format(linea.subtotal)}
      </td>

      <td className="px-4 py-3 text-center">
        <button
          type="button"
          onClick={onPedirEliminar}
          className="rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
          title="Eliminar línea"
          aria-label={`Eliminar ${linea.nombre_modulo}`}
        >
          🗑
        </button>
      </td>
    </tr>
  );
}

function FilaConfirmEliminar({
  linea,
  onConfirmar,
  onCancelar,
}: {
  linea: LineaTrabajo;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <tr className="border-b border-text-muted/10 bg-danger/5">
      <td colSpan={7} className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-main">
            ¿Eliminar la línea{' '}
            <span className="font-medium">{linea.nombre_modulo}</span>?
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancelar}>
              No
            </Button>
            <Button type="button" variant="danger" onClick={onConfirmar}>
              Sí, eliminar
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function CeldaEdicion({
  valor,
  ancho,
  onChange,
  onConfirm,
  onCancel,
}: {
  valor: string;
  ancho: string;
  onChange: (v: string) => void;
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
      onChange={(e) => onChange(e.target.value)}
      onBlur={onConfirm}
      onKeyDown={onKeyDown}
      className={`rounded border border-primary bg-card px-2 py-1 text-right text-sm text-text-main focus:outline-none focus:ring-1 focus:ring-primary ${ancho}`}
    />
  );
}

function FormularioAñadir({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: {
    nombre_modulo: string;
    tipo: TipoModulo;
    medida: string;
    descripcion: string;
    unidades: number;
    precio_unitario: number;
  }) => void;
  onCancel: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoModulo>('bajo');
  const [medida, setMedida] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [unidades, setUnidades] = useState('1');
  const [precio, setPrecio] = useState('');
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorLocal(null);
    const nombreT = nombre.trim();
    if (!nombreT) return setErrorLocal('Nombre obligatorio.');
    const uds = Number(unidades);
    if (!Number.isInteger(uds) || uds < 1)
      return setErrorLocal('Unidades debe ser entero ≥ 1.');
    const pr = Number(precio.replace(',', '.'));
    if (!Number.isFinite(pr) || pr < 0)
      return setErrorLocal('Precio debe ser número ≥ 0.');
    onSubmit({
      nombre_modulo: nombreT,
      tipo,
      medida: medida.trim(),
      descripcion: descripcion.trim(),
      unidades: uds,
      precio_unitario: pr,
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-3 border-b border-text-muted/15 bg-background/40 p-4 sm:grid-cols-12 sm:p-6"
    >
      <div className="sm:col-span-4">
        <label
          htmlFor="add-linea-nombre"
          className="block text-xs font-medium text-text-muted"
        >
          Nombre
        </label>
        <input
          id="add-linea-nombre"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          maxLength={200}
          placeholder="Módulo bajo 60cm 1 cajón"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-2">
        <label
          htmlFor="add-linea-tipo"
          className="block text-xs font-medium text-text-muted"
        >
          Tipo
        </label>
        <select
          id="add-linea-tipo"
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
          htmlFor="add-linea-medida"
          className="block text-xs font-medium text-text-muted"
        >
          Medida
        </label>
        <input
          id="add-linea-medida"
          type="text"
          value={medida}
          onChange={(e) => setMedida(e.target.value)}
          maxLength={50}
          placeholder="60x72x60"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-1">
        <label
          htmlFor="add-linea-uds"
          className="block text-xs font-medium text-text-muted"
        >
          Uds.
        </label>
        <input
          id="add-linea-uds"
          type="number"
          min={1}
          step={1}
          value={unidades}
          onChange={(e) => setUnidades(e.target.value)}
          required
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-3">
        <label
          htmlFor="add-linea-precio"
          className="block text-xs font-medium text-text-muted"
        >
          Precio (€)
        </label>
        <input
          id="add-linea-precio"
          type="text"
          inputMode="decimal"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
          placeholder="185,00"
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div className="sm:col-span-12">
        <label
          htmlFor="add-linea-desc"
          className="block text-xs font-medium text-text-muted"
        >
          Descripción <span className="text-text-muted">(opcional)</span>
        </label>
        <input
          id="add-linea-desc"
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={500}
          className="mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      {errorLocal && (
        <p className="sm:col-span-12 text-sm text-danger" role="alert">
          {errorLocal}
        </p>
      )}
      <div className="flex items-end gap-2 sm:col-span-12">
        <Button type="submit">Añadir línea</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function BloqueAclaracion({
  pregunta,
  planoUrl,
  rondaActual,
  puedeResponder,
  respuesta,
  setRespuesta,
  onSubmit,
  enviando,
}: {
  pregunta: string;
  planoUrl: string | null;
  rondaActual: number;
  puedeResponder: boolean;
  respuesta: string;
  setRespuesta: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  enviando: boolean;
}) {
  return (
    <Card className="space-y-4 border border-warning/30 bg-warning/5 p-6">
      <header className="flex items-start gap-3">
        <span className="text-2xl leading-none" aria-hidden>
          💡
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-warning">
            La IA necesita un dato antes de continuar
          </h3>
          <p className="mt-1 text-sm text-text-main">{pregunta}</p>
        </div>
        {puedeResponder && (
          <span className="whitespace-nowrap rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
            Ronda {rondaActual} de {MAX_RONDAS}
          </span>
        )}
      </header>

      {planoUrl && (
        <div className="flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={planoUrl}
            alt="Miniatura del plano subido"
            className="max-h-56 max-w-full rounded border border-text-muted/20 object-contain"
          />
        </div>
      )}

      {puedeResponder ? (
        <form onSubmit={onSubmit} className="space-y-3">
          <label
            htmlFor="respuesta-ia"
            className="block text-xs font-medium text-text-muted"
          >
            Tu respuesta para la IA
          </label>
          <textarea
            id="respuesta-ia"
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            maxLength={MAX_RESPUESTA_CHARS}
            rows={3}
            required
            placeholder="Aporta el dato que la IA necesita…"
            className="block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              {respuesta.length}/{MAX_RESPUESTA_CHARS} caracteres
            </span>
            <Button
              type="submit"
              loading={enviando}
              disabled={enviando || respuesta.trim().length === 0}
            >
              Continuar con el análisis
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Has alcanzado el máximo de {MAX_RONDAS} rondas de aclaración. Los
          módulos identificados son los actuales; edita los precios manualmente
          o pulsa &quot;Re-analizar&quot; para empezar de nuevo.
        </p>
      )}
    </Card>
  );
}

function ModalConfirmar({
  titulo,
  mensaje,
  textoConfirmar,
  variante,
  onConfirmar,
  onCancelar,
}: {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  variante: 'primary' | 'danger';
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancelar();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancelar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-md rounded-card bg-card p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-text-main">{titulo}</h3>
        <p className="mt-2 text-sm text-text-main">{mensaje}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancelar}>
            Cancelar
          </Button>
          <Button type="button" variant={variante} onClick={onConfirmar}>
            {textoConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormularioMedidas({
  medidas,
  onChange,
  onConfirmar,
  onCancelar,
}: {
  medidas: MedidasCocina;
  onChange: (m: MedidasCocina) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const MAX_PAREDES = 6;
  const inputClass =
    'mt-1 block w-full rounded-card border border-text-muted/30 bg-card px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

  const completo =
    medidas.paredes[0].trim() !== '' &&
    medidas.altoTecho.trim() !== '' &&
    medidas.profundidad_bajos.trim() !== '' &&
    medidas.profundidad_altos.trim() !== '' &&
    (!medidas.isla || (medidas.islaLongitud.trim() !== '' && medidas.islaAncho.trim() !== ''));

  function setPared(idx: number, val: string) {
    const paredes = [...medidas.paredes];
    paredes[idx] = val;
    onChange({ ...medidas, paredes });
  }

  function añadirPared() {
    if (medidas.paredes.length >= MAX_PAREDES) return;
    onChange({ ...medidas, paredes: [...medidas.paredes, ''] });
  }

  function eliminarPared(idx: number) {
    onChange({ ...medidas, paredes: medidas.paredes.filter((_, i) => i !== idx) });
  }

  return (
    <Card className="space-y-5 border border-primary/30 bg-primary/5 p-6">
      <header>
        <h3 className="text-base font-semibold text-text-main">Medidas de la cocina</h3>
        <p className="mt-1 text-sm text-text-muted">
          Necesitamos estas medidas para calcular dimensiones reales antes de analizar el plano.
        </p>
      </header>

      {/* Paredes */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-text-muted">Paredes (longitud en cm)</p>
        {medidas.paredes.map((val, idx) => (
          <div key={idx} className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor={`pared-${idx}`} className="block text-xs text-text-muted">
                {idx === 0 ? 'Pared 1 (obligatoria)' : `Pared ${idx + 1}`}
              </label>
              <input
                id={`pared-${idx}`}
                type="number"
                min={1}
                value={val}
                onChange={(e) => setPared(idx, e.target.value)}
                placeholder="ej: 360"
                className={inputClass}
              />
            </div>
            {idx > 0 && (
              <button
                type="button"
                onClick={() => eliminarPared(idx)}
                className="mb-0.5 rounded p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={`Eliminar pared ${idx + 1}`}
              >
                🗑
              </button>
            )}
          </div>
        ))}
        {medidas.paredes.length < MAX_PAREDES && (
          <button
            type="button"
            onClick={añadirPared}
            className="text-xs text-primary hover:underline"
          >
            + Añadir pared
          </button>
        )}
      </div>

      {/* Isla */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm text-text-main">
          <input
            type="checkbox"
            checked={medidas.isla}
            onChange={(e) =>
              onChange({ ...medidas, isla: e.target.checked, islaLongitud: '', islaAncho: '' })
            }
            className="rounded border-text-muted/30"
          />
          La cocina tiene isla
        </label>
        {medidas.isla && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="isla-longitud" className="block text-xs font-medium text-text-muted">
                Longitud de la isla (cm)
              </label>
              <input
                id="isla-longitud"
                type="number"
                min={1}
                value={medidas.islaLongitud}
                onChange={(e) => onChange({ ...medidas, islaLongitud: e.target.value })}
                placeholder="ej: 180"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="isla-ancho" className="block text-xs font-medium text-text-muted">
                Ancho de la isla (cm)
              </label>
              <input
                id="isla-ancho"
                type="number"
                min={1}
                value={medidas.islaAncho}
                onChange={(e) => onChange({ ...medidas, islaAncho: e.target.value })}
                placeholder="ej: 100"
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* Altura y profundidades */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="medida-alto" className="block text-xs font-medium text-text-muted">
            Altura del techo (cm)
          </label>
          <input
            id="medida-alto"
            type="number"
            min={1}
            value={medidas.altoTecho}
            onChange={(e) => onChange({ ...medidas, altoTecho: e.target.value })}
            placeholder="ej: 250"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="medida-prof-bajos" className="block text-xs font-medium text-text-muted">
            Profundidad módulos bajos (cm)
          </label>
          <input
            id="medida-prof-bajos"
            type="number"
            min={1}
            value={medidas.profundidad_bajos}
            onChange={(e) => onChange({ ...medidas, profundidad_bajos: e.target.value })}
            placeholder="ej: 60"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="medida-prof-altos" className="block text-xs font-medium text-text-muted">
            Profundidad módulos altos (cm)
          </label>
          <input
            id="medida-prof-altos"
            type="number"
            min={1}
            value={medidas.profundidad_altos}
            onChange={(e) => onChange({ ...medidas, profundidad_altos: e.target.value })}
            placeholder="ej: 35"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onCancelar} className="w-full sm:w-auto">
          Cancelar
        </Button>
        <Button type="button" disabled={!completo} onClick={onConfirmar} className="w-full sm:w-auto">
          Confirmar medidas
        </Button>
      </div>
    </Card>
  );
}

function Metrica({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-text-main">{value}</p>
    </Card>
  );
}
