// Tipos del dominio. Mapean 1:1 a las tablas Supabase de la spec sección 3.
// Las tablas y RLS reales se crean en el Paso 2.

export type RolUsuario = 'admin' | 'vendedor';

export type TipoModulo =
  | 'bajo'
  | 'alto'
  | 'columna'
  | 'electrodomestico'
  | 'encimera'
  | 'accesorio'
  | 'panel'
  | 'zocalo';

export const TIPOS_VALIDOS: readonly TipoModulo[] = [
  'bajo',
  'alto',
  'columna',
  'electrodomestico',
  'encimera',
  'accesorio',
  'panel',
  'zocalo',
] as const;

export type EstadoPresupuesto = 'borrador' | 'revisado' | 'enviado';

export interface Tienda {
  id: string;
  nombre: string;
  logo_url: string | null;
  color_primario: string;
  condiciones_comerciales: string | null;
  iva_porcentaje: number;
  email_contacto: string | null;
  telefono: string | null;
  direccion: string | null;
  created_at: string;
}

export interface Usuario {
  id: string;
  tienda_id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  created_at: string;
}

export interface Tarifa {
  id: string;
  tienda_id: string;
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  precio: number;
  activo: boolean;
}

export interface Presupuesto {
  id: string;
  tienda_id: string;
  usuario_id: string;
  cliente_nombre: string | null;
  cliente_email: string | null;
  cliente_telefono: string | null;
  imagen_url: string | null;
  estado: EstadoPresupuesto;
  notas_ia: string | null;
  total_neto: number;
  total_iva: number;
  total_bruto: number;
  pdf_url: string | null;
  numero_presupuesto: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineaPresupuesto {
  id: string;
  presupuesto_id: string;
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  descripcion: string | null;
  unidades: number;
  precio_unitario: number;
  subtotal: number;
  editado_manualmente: boolean;
  orden: number;
}

// Respuesta del modelo Claude al analizar un plano (spec sección 5.1).
export interface ModuloIA {
  nombre: string;
  tipo: TipoModulo;
  medida: string;
  descripcion: string;
  unidades: number;
}

export interface RespuestaAnalisisIA {
  modulos: ModuloIA[];
  pregunta: string | null;
}

// Línea del presupuesto tras el cruce IA ↔ tarifa (Paso 9, spec sección 5.2).
// `match_tier` es diagnóstico — útil para debug y para los tests del cruce.
// `editado_manualmente=true` cuando no se encontró precio (precio_unitario=0)
// y por tanto el vendedor debe rellenarlo manualmente.
export type MatchTier = 'tier1' | 'tier2' | 'tier3';

export interface LineaCruzada {
  nombre_modulo: string;
  tipo: TipoModulo;
  medida: string;
  descripcion: string;
  unidades: number;
  precio_unitario: number;
  subtotal: number;
  editado_manualmente: boolean;
  match_tier: MatchTier | null;
}

export interface RespuestaAnalisisCruzado {
  modulos: LineaCruzada[];
  pregunta: string | null;
}
