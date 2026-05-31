// Tests del cruce IA ↔ tarifa (función pura en lib/cruce-tarifa.ts).
// Importa el .ts directamente vía type stripping nativo de Node 24+.
import { cruzarConTarifa } from '../lib/cruce-tarifa.ts';

const TIENDA = '00000000-0000-0000-0000-000000000001';

const tarifa = [
  // Tier 1 — único con (nombre exacto, medida exacta)
  { id: 't1', tienda_id: TIENDA, nombre_modulo: 'Módulo bajo 60cm 3 cajones', tipo: 'bajo',  medida: '60x72x60', precio: 245, activo: true },
  // Tier 2 — substring: IA dirá "Módulo bajo 60cm" y solo esta fila lo contiene en su medida
  { id: 't2', tienda_id: TIENDA, nombre_modulo: 'Módulo bajo 60cm 1 cajón',   tipo: 'bajo',  medida: '60x72x99', precio: 185, activo: true },
  // Tier 3 — (tipo, medida) único, pero nombre distinto sin substring
  { id: 't3', tienda_id: TIENDA, nombre_modulo: 'Almacenamiento alto 80cm',    tipo: 'alto',  medida: '80x72x35', precio: 175, activo: true },
  // Ambigüedad para test de no-match — dos filas con mismo (tipo,medida) y substring relación con IA
  { id: 't4a', tienda_id: TIENDA, nombre_modulo: 'Columna despensa 60cm',     tipo: 'columna', medida: '60x220x60', precio: 580, activo: true },
  { id: 't4b', tienda_id: TIENDA, nombre_modulo: 'Columna horno + microondas', tipo: 'columna', medida: '60x220x60', precio: 640, activo: true },
];

const casos = [
  {
    name: 'Tier 1: nombre + medida exactos',
    ia: { nombre: 'Módulo bajo 60cm 3 cajones', tipo: 'bajo', medida: '60x72x60', descripcion: 'cajones', unidades: 2 },
    esperado: { precio_unitario: 245, subtotal: 490, editado_manualmente: false, match_tier: 'tier1', tipo: 'bajo' },
  },
  {
    name: 'Tier 1: case-insensitive y trim',
    ia: { nombre: '  módulo BAJO 60cm 3 CAJONES  ', tipo: 'bajo', medida: ' 60X72X60 ', descripcion: '', unidades: 1 },
    esperado: { precio_unitario: 245, subtotal: 245, editado_manualmente: false, match_tier: 'tier1' },
  },
  {
    name: 'Tier 2: medida exacta + IA substring del nombre de tarifa',
    ia: { nombre: 'Módulo bajo 60cm', tipo: 'bajo', medida: '60x72x99', descripcion: '', unidades: 3 },
    esperado: { precio_unitario: 185, subtotal: 555, editado_manualmente: false, match_tier: 'tier2' },
  },
  {
    name: 'Tier 3: (tipo,medida) único, nombre sin relación',
    ia: { nombre: 'Mueble superior cocina', tipo: 'alto', medida: '80x72x35', descripcion: '', unidades: 4 },
    esperado: { precio_unitario: 175, subtotal: 700, editado_manualmente: false, match_tier: 'tier3' },
  },
  {
    name: 'Sin match: 2 candidatos ambiguos en (tipo,medida), substring también ambiguo',
    ia: { nombre: 'Columna 60cm', tipo: 'columna', medida: '60x220x60', descripcion: '', unidades: 1 },
    esperado: { precio_unitario: 0, subtotal: 0, editado_manualmente: true, match_tier: null },
  },
  {
    name: 'Sin match: medida desconocida',
    ia: { nombre: 'Módulo bajo 60cm 3 cajones', tipo: 'bajo', medida: '999x999x999', descripcion: '', unidades: 1 },
    esperado: { precio_unitario: 0, subtotal: 0, editado_manualmente: true, match_tier: null },
  },
  {
    name: 'Tipo de tarifa gana sobre tipo de IA cuando hay match',
    ia: { nombre: 'Módulo bajo 60cm 3 cajones', tipo: 'electrodomestico', medida: '60x72x60', descripcion: '', unidades: 1 },
    esperado: { tipo: 'bajo', precio_unitario: 245, editado_manualmente: false, match_tier: 'tier1' },
  },
];

let pass = 0, fail = 0;
for (const c of casos) {
  const [linea] = cruzarConTarifa([c.ia], tarifa);
  const errores = [];
  for (const [k, v] of Object.entries(c.esperado)) {
    if (linea[k] !== v) errores.push(`${k}: esperado ${JSON.stringify(v)} got ${JSON.stringify(linea[k])}`);
  }
  if (errores.length === 0) {
    console.log(`  ✓ ${c.name}`);
    pass++;
  } else {
    console.log(`  ✗ ${c.name}`);
    for (const e of errores) console.log(`      ${e}`);
    fail++;
  }
}

// Caso adicional: verificar que las unidades se preservan y el subtotal redondea bien
const [redondeo] = cruzarConTarifa(
  [{ nombre: 'Módulo bajo 60cm 1 cajón', tipo: 'bajo', medida: '60x72x99', descripcion: '', unidades: 3 }],
  tarifa
);
if (redondeo.subtotal === 555) {
  console.log('  ✓ Subtotal redondeado a 2 decimales (185 × 3 = 555.00)');
  pass++;
} else {
  console.log(`  ✗ Subtotal incorrecto: esperado 555, got ${redondeo.subtotal}`);
  fail++;
}

console.log(`\n${pass} OK · ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
