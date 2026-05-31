# Kitchin

App SaaS de presupuestos de cocinas con IA. Construida según
`Especificaciones_Tecnicas_App_Cocinas.docx` (raíz del repo). Stack: Next.js 14
(App Router) + Supabase + Anthropic SDK.

## Desviaciones respecto al documento de especificaciones

Toda divergencia del docx se marca en el código fuente con el comentario:

```ts
// NOTA: modificado respecto a docx sec X (motivo)
```

Listado actual:

- **`lib/anthropic.ts` (docx sec 2 · stack).** El docx fija el modelo a
  `claude-sonnet-4-20250514`. Está deprecado y su retirada está programada para
  el **15-jun-2026**. Lo sustituimos por su sucesor directo del mismo tier,
  `claude-sonnet-4-6` (misma capacidad de visión, mismos precios, soporte
  nativo de adaptive thinking y structured outputs). La constante
  `ANTHROPIC_MODEL` queda aislada para revertir con un único cambio si fuera
  necesario.
- **`app/api/analizar-plano/route.ts` (docx sec 5.1 · prompt).** Última línea
  del prompt reescrita: en vez de _"Responde SOLO con JSON válido, sin
  markdown, sin texto adicional"_ ahora dice _"Responde siguiendo exactamente
  el JSON schema indicado…"_. Motivo: el formato JSON lo fuerza el API con
  `output_config.format` (structured outputs), repetir la instrucción en el
  prompt es redundante y empeora el cache hit. El schema en sí cubre los
  mismos campos descritos en el docx.
- **`app/api/analizar-plano/route.ts` (docx sec 5.2 · persistencia diferida).**
  El docx pide guardar las líneas cruzadas en `lineas_presupuesto` al final
  del cruce IA ↔ tarifa. Hasta el Paso 11 las líneas viajan solo en la
  respuesta JSON y viven en memoria de Pantalla 4b — se pierden al refrescar.
  Motivo: separar el cruce (Paso 9) del guardado del borrador (Paso 11) para
  que cada paso del plan tenga un hito verificable. Cuando se implemente la
  edición inline del Paso 11, ahí se persistirá con `editado_manualmente` y
  los precios snapshot al momento del análisis.
- **`lib/cruce-tarifa.ts` (docx sec 5.2 · tipo del módulo cruzado).** Cuando
  el cruce encuentra match, la línea hereda **tipo y precio de la tarifa** (no
  solo el precio como dice literal el docx). Motivo: la tarifa es dato curado
  por admin, la IA es interpretación visual; cuando hay desacuerdo en `tipo`
  la curada gana. El docx deja en silencio qué hacer si difieren — esta
  decisión cierra la ambigüedad.
- **`app/presupuestos/[id]/PresupuestoDetalle.tsx` (docx sec 4 · Pantalla 4a
  ubicación).** El docx describe Pantalla 4a (pregunta de la IA al vendedor)
  como pantalla intermedia con título, miniatura, textarea y botón
  "Continuar". Aquí se renderiza **inline en 4b**, no como ruta separada
  `/aclaracion`. Motivo: la pregunta es un estado transitorio del análisis;
  navegar a otra ruta y volver añade fricción sin ganancia funcional (el
  contexto del plano ya está cargado en 4b). El resto de elementos del docx
  (icono, título, pregunta, miniatura del plano firmada, textarea, botón
  "Continuar con el análisis", contador "Ronda X de 3") sí están incluidos.

## Ideas para Paso 14 (optimizaciones)

Optimizaciones identificadas a lo largo del build que no son críticas pero
conviene capturar para no perderlas:

- **`cache_control` sobre el bloque imagen en `/api/analizar-plano`.** En
  follow-ups del Paso 10 (Pantalla 4a) la imagen del plano vuelve a viajar
  base64 en cada llamada (~1600-3000 tokens de visión por ronda). Activar
  prompt caching en el primer bloque `user` (image + text inicial) haría que
  las rondas 2 y 3 lean la imagen de cache (~0.1× del coste). Requiere
  estabilizar el formato del mensaje y placement cuidadoso del breakpoint —
  ver `claude-api` skill, sección "Prompt Caching".
- **Rate-limiting distribuido (`/api/analizar-plano`, sec 8 docx).** El
  cooldown actual usa un `Map` en memoria del proceso. No sobrevive a HMR ni
  a múltiples instancias en Vercel. Sustituir por Vercel KV / Upstash Redis
  cuando el deploy sea multi-instancia.
- **Constraint UNIQUE en `tarifas (tienda_id, nombre_modulo, medida)`.**
  Actualmente el upsert del Paso 8b es a nivel aplicación. Una constraint a
  nivel BD permitiría usar `INSERT ... ON CONFLICT DO UPDATE` en una sola
  query y blindar contra duplicados manuales desde el Panel admin.

## Setup

1. Variables de entorno: copia `.env.example` a `.env.local` y rellena
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY`.
2. Aplicar el schema y el seed de Supabase: ver `supabase/README.md`.
3. Crear el usuario admin demo: `node scripts/create-demo-user.mjs` (requiere
   la service role real, no la publishable). Login en local con
   `demo@kitchin.app` / `Demo2026!`.
4. `npm run dev` y abrir http://localhost:3000.

## Stack

Next.js 14 · TypeScript · Tailwind CSS · Supabase (Auth + Postgres + Storage)
· Anthropic SDK (visión).
