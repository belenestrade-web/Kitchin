import { describe, expect, it } from 'vitest'
import { cruzarConTarifa } from '@/lib/cruce-tarifa'
import type { ModuloIA, Tarifa } from '@/types/database'

function mkTarifa(overrides: Partial<Tarifa> = {}): Tarifa {
  return {
    id: 'tarifa-1',
    tienda_id: 'tienda-1',
    nombre_modulo: 'Armario Alto',
    tipo: 'alto',
    medida: '60x70',
    precio: 100,
    activo: true,
    ...overrides,
  }
}

function mkModulo(overrides: Partial<ModuloIA> = {}): ModuloIA {
  return {
    nombre: 'Armario Alto',
    tipo: 'alto',
    medida: '60x70',
    descripcion: 'Módulo de prueba',
    unidades: 1,
    ...overrides,
  }
}

describe('cruzarConTarifa', () => {
  // --- Vacíos ---

  it('devuelve array vacío si no hay módulos', () => {
    expect(cruzarConTarifa([], [mkTarifa()])).toEqual([])
  })

  it('todos sin match si no hay tarifas', () => {
    const [linea] = cruzarConTarifa([mkModulo()], [])
    expect(linea.editado_manualmente).toBe(true)
    expect(linea.match_tier).toBeNull()
  })

  // --- Tier 1: nombre + medida exactos ---

  describe('Tier 1 — nombre + medida exactos', () => {
    it('match exacto → tier1, tipo y precio de tarifa', () => {
      const tarifa = mkTarifa({ tipo: 'alto', precio: 250 })
      const modulo = mkModulo({ tipo: 'bajo' }) // tipo IA difiere, tarifa gana
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.match_tier).toBe('tier1')
      expect(linea.editado_manualmente).toBe(false)
      expect(linea.tipo).toBe('alto')
      expect(linea.precio_unitario).toBe(250)
    })

    it('match case-insensitive en nombre y medida', () => {
      const tarifa = mkTarifa({ nombre_modulo: 'armario alto', medida: '60x70' })
      const modulo = mkModulo({ nombre: 'ARMARIO ALTO', medida: '60X70' })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.match_tier).toBe('tier1')
    })

    it('nombre, medida, descripcion y unidades vienen de módulo IA (no de tarifa)', () => {
      const tarifa = mkTarifa({ nombre_modulo: 'Armario Alto', medida: '60x70' })
      const modulo = mkModulo({ nombre: 'Armario Alto', medida: '60x70', descripcion: 'desc IA', unidades: 3 })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.nombre_modulo).toBe('Armario Alto')
      expect(linea.medida).toBe('60x70')
      expect(linea.descripcion).toBe('desc IA')
      expect(linea.unidades).toBe(3)
    })

    it('2 candidatos en Tier 1 → no aplica Tier 1', () => {
      const t1 = mkTarifa({ id: 't1' })
      const t2 = mkTarifa({ id: 't2' }) // misma nombre+medida que t1
      const [linea] = cruzarConTarifa([mkModulo()], [t1, t2])
      expect(linea.match_tier).not.toBe('tier1')
    })
  })

  // --- Tier 2: substring de nombre + misma medida ---

  describe('Tier 2 — substring de nombre + misma medida', () => {
    it('nombre de tarifa contiene nombre de módulo → tier2', () => {
      // tarifa "Armario Alto Especial" ⊃ módulo "Armario Alto"
      const tarifa = mkTarifa({ nombre_modulo: 'Armario Alto Especial', medida: '60x70', precio: 300, tipo: 'alto' })
      const modulo = mkModulo({ nombre: 'Armario Alto', medida: '60x70', tipo: 'bajo' })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.match_tier).toBe('tier2')
      expect(linea.precio_unitario).toBe(300)
      expect(linea.tipo).toBe('alto')
    })

    it('nombre de módulo contiene nombre de tarifa → tier2', () => {
      // tarifa "Armario" ⊂ módulo "Armario Alto"
      const tarifa = mkTarifa({ nombre_modulo: 'Armario', medida: '60x70', precio: 200 })
      const modulo = mkModulo({ nombre: 'Armario Alto', medida: '60x70' })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.match_tier).toBe('tier2')
    })

    it('medida vacía en módulo → Tier 2 no aplica aunque haya substring', () => {
      // Tier 2 exige medida no vacía. Tipo distinto previene Tier 3.
      const tarifa = mkTarifa({ nombre_modulo: 'Armario Alto Especial', tipo: 'bajo', medida: '' })
      const modulo = mkModulo({ nombre: 'Armario Alto', tipo: 'alto', medida: '' })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.editado_manualmente).toBe(true)
      expect(linea.match_tier).toBeNull()
    })

    it('2 candidatos en Tier 2 → no aplica Tier 2', () => {
      const t1 = mkTarifa({ id: 't1', nombre_modulo: 'Armario Alto Estrecho', medida: '60x70' })
      const t2 = mkTarifa({ id: 't2', nombre_modulo: 'Armario Alto Ancho', medida: '60x70' })
      const modulo = mkModulo({ nombre: 'Armario Alto', medida: '60x70' })
      const [linea] = cruzarConTarifa([modulo], [t1, t2])
      expect(linea.match_tier).not.toBe('tier2')
    })
  })

  // --- Tier 3: tipo + medida exactos ---

  describe('Tier 3 — tipo + medida exactos', () => {
    it('único candidato con mismo tipo+medida → tier3', () => {
      // nombre distinto, pero tipo+medida coinciden y es el único
      const tarifa = mkTarifa({ nombre_modulo: 'Mueble Premium', tipo: 'alto', medida: '60x70', precio: 400 })
      const modulo = mkModulo({ nombre: 'Armario Genérico', tipo: 'alto', medida: '60x70' })
      const [linea] = cruzarConTarifa([modulo], [tarifa])
      expect(linea.match_tier).toBe('tier3')
      expect(linea.precio_unitario).toBe(400)
    })

    it('2 candidatos en Tier 3 → sin match', () => {
      const t1 = mkTarifa({ id: 't1', nombre_modulo: 'Mueble A', tipo: 'alto', medida: '60x70' })
      const t2 = mkTarifa({ id: 't2', nombre_modulo: 'Mueble B', tipo: 'alto', medida: '60x70' })
      const modulo = mkModulo({ nombre: 'Otro Mueble', tipo: 'alto', medida: '60x70' })
      const [linea] = cruzarConTarifa([modulo], [t1, t2])
      expect(linea.match_tier).toBeNull()
      expect(linea.editado_manualmente).toBe(true)
    })
  })

  // --- Sin match ---

  describe('sin match', () => {
    it('precio=0, subtotal=0, editado_manualmente=true, tipo de IA', () => {
      const [linea] = cruzarConTarifa([mkModulo({ tipo: 'bajo' })], [])
      expect(linea.precio_unitario).toBe(0)
      expect(linea.subtotal).toBe(0)
      expect(linea.editado_manualmente).toBe(true)
      expect(linea.match_tier).toBeNull()
      expect(linea.tipo).toBe('bajo') // tipo de IA, no hay tarifa que reemplace
    })
  })

  // --- Subtotal y redondeo ---

  describe('subtotal y redondeo', () => {
    it('subtotal = precio × unidades', () => {
      const [linea] = cruzarConTarifa([mkModulo({ unidades: 3 })], [mkTarifa({ precio: 150 })])
      expect(linea.subtotal).toBe(450)
    })

    it('precio y subtotal redondeados a 2 decimales', () => {
      // precio=100.005: redondear2(100.005) = 100.01; subtotal=redondear2(100.005*2)=200.01
      const [linea] = cruzarConTarifa([mkModulo({ unidades: 2 })], [mkTarifa({ precio: 100.005 })])
      expect(linea.precio_unitario).toBe(100.01)
      expect(linea.subtotal).toBe(200.01)
    })
  })

  // --- Múltiples módulos ---

  it('procesa múltiples módulos independientemente', () => {
    const tarifas = [
      mkTarifa({ id: 't1', nombre_modulo: 'Módulo A', medida: '60x70', precio: 100, tipo: 'bajo' }),
      mkTarifa({ id: 't2', nombre_modulo: 'Módulo B', medida: '80x80', precio: 200, tipo: 'alto' }),
    ]
    const modulos = [
      mkModulo({ nombre: 'Módulo A', medida: '60x70' }),
      mkModulo({ nombre: 'Módulo B', medida: '80x80' }),
      mkModulo({ nombre: 'Módulo C', medida: '50x50' }), // sin match
    ]
    const resultado = cruzarConTarifa(modulos, tarifas)
    expect(resultado).toHaveLength(3)
    expect(resultado[0].precio_unitario).toBe(100)
    expect(resultado[1].precio_unitario).toBe(200)
    expect(resultado[2].editado_manualmente).toBe(true)
  })
})
