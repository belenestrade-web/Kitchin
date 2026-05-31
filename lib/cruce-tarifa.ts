// Cruce módulos IA ↔ tarifa de la tienda (Paso 9, docx sec 5.2).
//
// Función pura: dado un array de módulos extraídos por la IA y un array de
// filas de tarifa (que el caller ya filtra por tienda_id + activo=true vía
// RLS), devuelve líneas listas para Pantalla 4b — cada una con precio,
// subtotal y la marca `editado_manualmente` cuando no se encontró match.
//
// Algoritmo en 3 tiers, estrictos: cada tier solo dispara si hay
// exactamente un candidato. Cualquier ambigüedad (2+) cae al siguiente.

import type {
  LineaCruzada,
  MatchTier,
  ModuloIA,
  Tarifa,
} from '@/types/database';

function normalizar(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface CandidatoMatch {
  tarifa: Tarifa;
  tier: MatchTier;
}

function buscarMatch(
  modulo: ModuloIA,
  tarifas: ReadonlyArray<Tarifa>
): CandidatoMatch | null {
  const nNombre = normalizar(modulo.nombre);
  const nMedida = normalizar(modulo.medida);

  // Tier 1 — nombre + medida exactos (case-insensitive). Solo si hay 1 candidato.
  const t1 = tarifas.filter(
    (t) =>
      normalizar(t.nombre_modulo) === nNombre &&
      normalizar(t.medida) === nMedida
  );
  if (t1.length === 1) return { tarifa: t1[0], tier: 'tier1' };

  // Tier 2 — misma medida + relación de substring entre nombres. Solo si 1.
  // Exigimos medida no vacía: sin medida, "substring de nombre" no es señal
  // suficientemente fuerte para confiar.
  if (nMedida !== '') {
    const t2 = tarifas.filter((t) => {
      if (normalizar(t.medida) !== nMedida) return false;
      const nT = normalizar(t.nombre_modulo);
      if (nT === nNombre) return false; // ya cubierto en Tier 1
      return nT.includes(nNombre) || nNombre.includes(nT);
    });
    if (t2.length === 1) return { tarifa: t2[0], tier: 'tier2' };
  }

  // Tier 3 — tipo + medida exactos, exactamente una fila activa para esa
  // combinación. Útil cuando la IA rebautiza el módulo pero el (tipo,medida)
  // de la tarifa es único.
  const t3 = tarifas.filter(
    (t) => t.tipo === modulo.tipo && normalizar(t.medida) === nMedida
  );
  if (t3.length === 1) return { tarifa: t3[0], tier: 'tier3' };

  return null;
}

export function cruzarConTarifa(
  modulosIA: ReadonlyArray<ModuloIA>,
  tarifas: ReadonlyArray<Tarifa>
): LineaCruzada[] {
  return modulosIA.map((m) => {
    const match = buscarMatch(m, tarifas);

    if (match) {
      // Decisión Paso 9 punto 2: cuando hay match, tipo y precio vienen de
      // la tarifa (dato curado). Nombre, medida, descripción y unidades de
      // la IA. Esto cierra inconsistencias tipo "IA dice alto pero tarifa
      // dice bajo" — la tarifa, curada por el admin, gana.
      const precio = Number(match.tarifa.precio);
      return {
        nombre_modulo: m.nombre,
        tipo: match.tarifa.tipo,
        medida: m.medida,
        descripcion: m.descripcion,
        unidades: m.unidades,
        precio_unitario: redondear2(precio),
        subtotal: redondear2(precio * m.unidades),
        editado_manualmente: false,
        match_tier: match.tier,
      };
    }

    // Sin match: precio 0, editado_manualmente=true. Mantengo el tipo de
    // la IA (no hay fuente curada con la que reemplazarlo).
    return {
      nombre_modulo: m.nombre,
      tipo: m.tipo,
      medida: m.medida,
      descripcion: m.descripcion,
      unidades: m.unidades,
      precio_unitario: 0,
      subtotal: 0,
      editado_manualmente: true,
      match_tier: null,
    };
  });
}
