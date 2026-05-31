'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { TIPOS_VALIDOS, type TipoModulo } from '@/types/database';

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface LineaInput {
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  descripcion: string;
  unidades: number;
  precio_unitario: number;
  editado_manualmente: boolean;
}

interface Totales {
  total_neto: number;
  total_iva: number;
  total_bruto: number;
  lineas_count: number;
}

const MAX_LINEAS = 200;
const MAX_NOMBRE = 200;
const MAX_DESCRIPCION = 500;
const MAX_MEDIDA = 50;

function validarLineas(
  raw: unknown
): { ok: true; lineas: LineaInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'El cuerpo no es un array de líneas.' };
  }
  if (raw.length > MAX_LINEAS) {
    return {
      ok: false,
      error: `Demasiadas líneas (${raw.length}). Máximo ${MAX_LINEAS}.`,
    };
  }
  const lineas: LineaInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      return { ok: false, error: `Línea ${i + 1}: formato inválido.` };
    }
    const r = item as Record<string, unknown>;
    const nombre = String(r.nombre_modulo ?? '').trim();
    if (!nombre) {
      return { ok: false, error: `Línea ${i + 1}: nombre vacío.` };
    }
    if (nombre.length > MAX_NOMBRE) {
      return {
        ok: false,
        error: `Línea ${i + 1}: nombre demasiado largo (>${MAX_NOMBRE}).`,
      };
    }
    const tipo = String(r.tipo ?? '').trim().toLowerCase();
    if (!TIPOS_VALIDOS.includes(tipo as TipoModulo)) {
      return {
        ok: false,
        error: `Línea ${i + 1}: tipo "${tipo}" no válido (esperado: ${TIPOS_VALIDOS.join(', ')}).`,
      };
    }
    const medida = String(r.medida ?? '').trim();
    if (medida.length > MAX_MEDIDA) {
      return {
        ok: false,
        error: `Línea ${i + 1}: medida demasiado larga (>${MAX_MEDIDA}).`,
      };
    }
    const descripcion = String(r.descripcion ?? '').trim();
    if (descripcion.length > MAX_DESCRIPCION) {
      return {
        ok: false,
        error: `Línea ${i + 1}: descripción demasiado larga (>${MAX_DESCRIPCION}).`,
      };
    }
    const unidadesRaw = Number(r.unidades);
    if (!Number.isInteger(unidadesRaw) || unidadesRaw < 1) {
      return {
        ok: false,
        error: `Línea ${i + 1}: unidades debe ser entero ≥ 1.`,
      };
    }
    const precioRaw = Number(r.precio_unitario);
    if (!Number.isFinite(precioRaw) || precioRaw < 0) {
      return {
        ok: false,
        error: `Línea ${i + 1}: precio_unitario debe ser número ≥ 0.`,
      };
    }
    lineas.push({
      nombre_modulo: nombre,
      tipo: tipo as TipoModulo,
      medida,
      descripcion,
      unidades: unidadesRaw,
      precio_unitario: Math.round(precioRaw * 100) / 100,
      editado_manualmente: r.editado_manualmente === true,
    });
  }
  return { ok: true, lineas };
}

export async function guardarLineas(
  presupuestoId: unknown,
  lineas: unknown
): Promise<ActionResult<Totales>> {
  if (typeof presupuestoId !== 'string' || !presupuestoId) {
    return { ok: false, error: 'presupuesto_id inválido.' };
  }

  const v = validarLineas(lineas);
  if (!v.ok) return { ok: false, error: v.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  // RPC atómica (DELETE + INSERT + UPDATE totales en una transacción).
  // security invoker → la RLS aplica con la identidad del caller.
  const { data, error } = await supabase.rpc('guardar_lineas_presupuesto', {
    p_presupuesto_id: presupuestoId,
    p_lineas: v.lineas,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Respuesta inesperada del servidor.' };
  }

  const t = data as Record<string, unknown>;
  const totales: Totales = {
    total_neto: Number(t.total_neto ?? 0),
    total_iva: Number(t.total_iva ?? 0),
    total_bruto: Number(t.total_bruto ?? 0),
    lineas_count: Number(t.lineas_count ?? v.lineas.length),
  };

  revalidatePath(`/presupuestos/${presupuestoId}`);
  revalidatePath('/dashboard');

  return { ok: true, data: totales };
}
