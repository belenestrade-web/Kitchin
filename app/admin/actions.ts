'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { TIPOS_VALIDOS, type Tarifa, type TipoModulo } from '@/types/database';

// Internos: tipos y constantes auxiliares NO se exportan desde un fichero
// 'use server' (Next solo permite exportar funciones async). El enum runtime
// vive en types/database.ts y se importa arriba.
type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

interface AdminCtx {
  userId: string;
  tiendaId: string;
}

async function requireAdmin(): Promise<AdminCtx | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado.' };

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('rol, tienda_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!usuario) return { error: 'Cuenta sin tienda asociada.' };
  if (usuario.rol !== 'admin') {
    return { error: 'Solo el admin puede editar la tarifa.' };
  }
  return { userId: user.id, tiendaId: usuario.tienda_id };
}

function parsePrecio(raw: unknown): number | { error: string } {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) {
      return { error: 'El precio debe ser un número ≥ 0.' };
    }
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === 'string') {
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      return { error: 'El precio debe ser un número ≥ 0.' };
    }
    return Math.round(n * 100) / 100;
  }
  return { error: 'Precio inválido.' };
}

export async function actualizarPrecio(
  id: string,
  precio: number | string
): Promise<ActionResult> {
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'id inválido.' };
  }
  const precioNum = parsePrecio(precio);
  if (typeof precioNum !== 'number') {
    return { ok: false, error: precioNum.error };
  }

  const ctx = await requireAdmin();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tarifas')
    .update({ precio: precioNum })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Tarifa no encontrada en tu tienda.' };
  }

  revalidatePath('/admin');
  return { ok: true, data: undefined };
}

export async function toggleActivo(
  id: string,
  activo: boolean
): Promise<ActionResult> {
  if (typeof id !== 'string' || !id) {
    return { ok: false, error: 'id inválido.' };
  }
  if (typeof activo !== 'boolean') {
    return { ok: false, error: 'Estado activo inválido.' };
  }

  const ctx = await requireAdmin();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tarifas')
    .update({ activo })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Tarifa no encontrada en tu tienda.' };
  }

  revalidatePath('/admin');
  return { ok: true, data: undefined };
}

interface CrearTarifaInput {
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  precio: number | string;
}

export async function crearTarifa(
  input: CrearTarifaInput
): Promise<ActionResult<Tarifa>> {
  const nombre = String(input?.nombre_modulo ?? '').trim();
  const medida = String(input?.medida ?? '').trim();
  const tipo = input?.tipo;

  if (!nombre) {
    return { ok: false, error: 'El nombre del módulo es obligatorio.' };
  }
  if (nombre.length > 200) {
    return { ok: false, error: 'El nombre del módulo es demasiado largo.' };
  }
  if (!TIPOS_VALIDOS.includes(tipo as TipoModulo)) {
    return {
      ok: false,
      error: `Tipo inválido. Debe ser uno de: ${TIPOS_VALIDOS.join(', ')}.`,
    };
  }
  const precioNum = parsePrecio(input?.precio);
  if (typeof precioNum !== 'number') {
    return { ok: false, error: precioNum.error };
  }

  const ctx = await requireAdmin();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const supabase = createClient();
  const { data, error } = await supabase
    .from('tarifas')
    .insert({
      tienda_id: ctx.tiendaId,
      nombre_modulo: nombre,
      tipo: tipo as TipoModulo,
      medida: medida || null,
      precio: precioNum,
      activo: true,
    })
    .select('id, tienda_id, nombre_modulo, tipo, medida, precio, activo')
    .single();
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'No se pudo crear el módulo.',
    };
  }

  revalidatePath('/admin');
  return { ok: true, data: data as Tarifa };
}

// ---------------------------------------------------------------------------
// Identidad visual + condiciones comerciales (Paso 13)
// ---------------------------------------------------------------------------

interface ActualizarTiendaInput {
  nombre: string;
  email_contacto: string;
  telefono: string;
  direccion: string;
  color_primario: string;
  condiciones_comerciales: string;
  logo_url?: string; // path en Storage; se omite cuando no se cambia el logo
}

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function actualizarTienda(
  input: ActualizarTiendaInput
): Promise<ActionResult> {
  const nombre = String(input?.nombre ?? '').trim();
  if (!nombre)
    return { ok: false, error: 'El nombre de la tienda es obligatorio.' };
  if (nombre.length > 200)
    return { ok: false, error: 'El nombre es demasiado largo (máx. 200 car.).' };

  const emailContacto = String(input?.email_contacto ?? '').trim();
  if (emailContacto) {
    if (emailContacto.length > 200)
      return { ok: false, error: 'El email de contacto es demasiado largo.' };
    if (!EMAIL_RE.test(emailContacto))
      return { ok: false, error: 'El email de contacto no tiene formato válido.' };
  }

  const telefono = String(input?.telefono ?? '').trim();
  if (telefono.length > 50)
    return { ok: false, error: 'El teléfono es demasiado largo (máx. 50 car.).' };

  const direccion = String(input?.direccion ?? '').trim();
  if (direccion.length > 500)
    return { ok: false, error: 'La dirección es demasiado larga (máx. 500 car.).' };

  const colorPrimario = String(input?.color_primario ?? '').trim();
  if (!HEX_COLOR_RE.test(colorPrimario))
    return {
      ok: false,
      error: 'El color debe ser un valor hexadecimal válido (ej: #1E5FA8).',
    };

  const condiciones = String(input?.condiciones_comerciales ?? '').trim();
  if (condiciones.length > 5000)
    return {
      ok: false,
      error: 'Las condiciones son demasiado largas (máx. 5000 car.).',
    };

  // logo_url: path en Storage — solo se actualiza cuando se pasa explícitamente.
  // Nunca viene del body del formulario como URL arbitraria; el cliente
  // lo construye como `{tienda_id}/logo.{ext}` tras subir el archivo.
  const logoUrl =
    input?.logo_url !== undefined ? String(input.logo_url).trim() : undefined;
  if (logoUrl !== undefined && logoUrl.length > 300)
    return { ok: false, error: 'Ruta del logo inválida.' };

  const ctx = await requireAdmin();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const supabase = createClient();

  const patch: Record<string, string | null> = {
    nombre,
    email_contacto: emailContacto || null,
    telefono: telefono || null,
    direccion: direccion || null,
    color_primario: colorPrimario,
    condiciones_comerciales: condiciones || null,
  };
  if (logoUrl !== undefined) patch.logo_url = logoUrl || null;

  const { error } = await supabase
    .from('tiendas')
    .update(patch)
    .eq('id', ctx.tiendaId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin');
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Importación CSV (Paso 8b)
// ---------------------------------------------------------------------------

interface FilaCsvCruda {
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

interface FilaPlan {
  numero: number;
  accion: 'insertar' | 'actualizar';
  id_existente: string | null;
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string | null;
  precio: number;
  precio_anterior: number | null;
}

interface PreviewResult {
  total_filas: number;
  a_insertar: number;
  a_actualizar: number;
  ignoradas: FilaIgnorada[];
  plan: FilaPlan[];
}

interface AplicarResult {
  insertadas: number;
  actualizadas: number;
  ignoradas: FilaIgnorada[];
  filas_finales: Tarifa[];
}

const MAX_FILAS_IMPORT = 5000;

function claveTarifa(nombre: string, medida: string | null): string {
  return `${nombre.trim().toLowerCase()}||${(medida ?? '').trim().toLowerCase()}`;
}

function validarFila(row: FilaCsvCruda):
  | {
      ok: true;
      nombre: string;
      tipo: TipoModulo;
      medida: string | null;
      precio: number;
    }
  | { ok: false; razon: string } {
  const nombre = String(row.nombre_modulo ?? '').trim();
  const tipoRaw = String(row.tipo ?? '').trim().toLowerCase();
  const medidaRaw = String(row.medida ?? '').trim();
  const precioRaw = String(row.precio ?? '').trim();

  if (!nombre) return { ok: false, razon: 'nombre_modulo vacío' };
  if (nombre.length > 200) return { ok: false, razon: 'nombre_modulo demasiado largo (>200)' };
  if (!TIPOS_VALIDOS.includes(tipoRaw as TipoModulo)) {
    return {
      ok: false,
      razon: `tipo "${row.tipo}" no válido (esperado: ${TIPOS_VALIDOS.join(', ')})`,
    };
  }
  if (!precioRaw) return { ok: false, razon: 'precio vacío' };
  const precioNum = Number(precioRaw.replace(',', '.'));
  if (!Number.isFinite(precioNum)) {
    return { ok: false, razon: `precio "${row.precio}" no es numérico` };
  }
  if (precioNum < 0) {
    return { ok: false, razon: `precio ${precioNum} es negativo` };
  }
  return {
    ok: true,
    nombre,
    tipo: tipoRaw as TipoModulo,
    medida: medidaRaw || null,
    precio: Math.round(precioNum * 100) / 100,
  };
}

async function clasificarFilas(rows: FilaCsvCruda[]): Promise<
  | {
      ok: true;
      plan: FilaPlan[];
      ignoradas: FilaIgnorada[];
      tiendaId: string;
    }
  | { ok: false; error: string }
> {
  if (!Array.isArray(rows)) return { ok: false, error: 'Filas inválidas.' };
  if (rows.length === 0) return { ok: false, error: 'El CSV no contiene filas de datos.' };
  if (rows.length > MAX_FILAS_IMPORT) {
    return {
      ok: false,
      error: `Demasiadas filas (${rows.length}). Máximo ${MAX_FILAS_IMPORT} por importación.`,
    };
  }

  const ctx = await requireAdmin();
  if ('error' in ctx) return { ok: false, error: ctx.error };

  const supabase = createClient();
  const { data: existentes, error: existErr } = await supabase
    .from('tarifas')
    .select('id, nombre_modulo, medida, precio');
  if (existErr) return { ok: false, error: existErr.message };

  const lookup = new Map<string, { id: string; precio: number }>();
  for (const e of existentes ?? []) {
    lookup.set(claveTarifa(e.nombre_modulo, e.medida), {
      id: e.id,
      precio: Number(e.precio),
    });
  }

  const plan: FilaPlan[] = [];
  const ignoradas: FilaIgnorada[] = [];

  for (const row of rows) {
    const val = validarFila(row);
    if (!val.ok) {
      ignoradas.push({
        numero: row.numero,
        razon: val.razon,
        nombre_modulo: String(row.nombre_modulo ?? '').trim(),
      });
      continue;
    }
    const existente = lookup.get(claveTarifa(val.nombre, val.medida));
    plan.push({
      numero: row.numero,
      accion: existente ? 'actualizar' : 'insertar',
      id_existente: existente?.id ?? null,
      nombre_modulo: val.nombre,
      tipo: val.tipo,
      medida: val.medida,
      precio: val.precio,
      precio_anterior: existente ? existente.precio : null,
    });
  }

  return { ok: true, plan, ignoradas, tiendaId: ctx.tiendaId };
}

export async function previsualizarImportacionTarifa(
  rows: FilaCsvCruda[]
): Promise<ActionResult<PreviewResult>> {
  const res = await clasificarFilas(rows);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    data: {
      total_filas: rows.length,
      a_insertar: res.plan.filter((p) => p.accion === 'insertar').length,
      a_actualizar: res.plan.filter((p) => p.accion === 'actualizar').length,
      ignoradas: res.ignoradas,
      plan: res.plan,
    },
  };
}

export async function aplicarImportacionTarifa(
  rows: FilaCsvCruda[]
): Promise<ActionResult<AplicarResult>> {
  const res = await clasificarFilas(rows);
  if (!res.ok) return { ok: false, error: res.error };
  const { plan, ignoradas, tiendaId } = res;

  const supabase = createClient();
  const insertadasFilas: Tarifa[] = [];
  const actualizadasFilas: Tarifa[] = [];
  const erroresWrite: FilaIgnorada[] = [];

  const aInsertar = plan.filter((p) => p.accion === 'insertar');
  if (aInsertar.length > 0) {
    const { data, error } = await supabase
      .from('tarifas')
      .insert(
        aInsertar.map((p) => ({
          tienda_id: tiendaId,
          nombre_modulo: p.nombre_modulo,
          tipo: p.tipo,
          medida: p.medida,
          precio: p.precio,
          activo: true,
        }))
      )
      .select('id, tienda_id, nombre_modulo, tipo, medida, precio, activo');
    if (error) {
      // Si el batch insert falla, todas las filas se anotan como ignoradas con
      // razón del error de BD. Conservador pero claro: el usuario verá qué pasó.
      for (const p of aInsertar) {
        erroresWrite.push({
          numero: p.numero,
          razon: `insert falló: ${error.message}`,
          nombre_modulo: p.nombre_modulo,
        });
      }
    } else if (data) {
      insertadasFilas.push(...(data as Tarifa[]));
    }
  }

  for (const p of plan.filter((x) => x.accion === 'actualizar')) {
    if (!p.id_existente) continue;
    const { data, error } = await supabase
      .from('tarifas')
      .update({ precio: p.precio })
      .eq('id', p.id_existente)
      .select('id, tienda_id, nombre_modulo, tipo, medida, precio, activo')
      .single();
    if (error || !data) {
      erroresWrite.push({
        numero: p.numero,
        razon: `update falló: ${error?.message ?? 'sin datos'}`,
        nombre_modulo: p.nombre_modulo,
      });
    } else {
      actualizadasFilas.push(data as Tarifa);
    }
  }

  revalidatePath('/admin');
  return {
    ok: true,
    data: {
      insertadas: insertadasFilas.length,
      actualizadas: actualizadasFilas.length,
      ignoradas: [...ignoradas, ...erroresWrite],
      filas_finales: [...insertadasFilas, ...actualizadasFilas],
    },
  };
}
