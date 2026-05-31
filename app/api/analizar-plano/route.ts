import { NextResponse, type NextRequest } from 'next/server';
import type Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { ANTHROPIC_MODEL, createAnthropicClient } from '@/lib/anthropic';
import { cruzarConTarifa } from '@/lib/cruce-tarifa';
import type { RespuestaAnalisisIA, Tarifa } from '@/types/database';

export const runtime = 'nodejs';
export const maxDuration = 60;

const SYSTEM_PROMPT = `Eres un experto en mobiliario de cocina con 20 años de experiencia. Analiza este plano o imagen de una cocina y extrae todos los módulos de mobiliario visibles.

Para cada módulo identifica:
- nombre: nombre descriptivo del módulo (ej: "Módulo bajo 60cm", "Módulo alto puertas", "Columna despensa")
- tipo: "alto", "bajo", "columna", "electrodomestico", "encimera", "panel" o "zocalo"
- medida: ancho x alto x fondo en cm (ej: "60x72x60"). Si no se puede determinar, usa el estándar del sector.
- IMPORTANTE: si la imagen es una fotografía (no un plano CAD con cotas), añade siempre una pregunta obligatoria pidiendo el ancho total de la cocina, la altura del techo y la profundidad de los módulos. Sin estas medidas no puedes calcular dimensiones reales.
- descripcion: descripción breve en máximo 5 palabras
- unidades: número entero
- pregunta: si tienes alguna duda relevante que cambie el presupuesto, escríbela aquí. Si no tienes dudas, pon null.

Responde siguiendo exactamente el JSON schema indicado, sin markdown ni texto adicional.`;
// NOTA: modificado respecto a docx sec 5.1 (última línea del prompt).
// El docx pedía "Responde SOLO con JSON válido, sin markdown, sin texto
// adicional". Lo sustituye `output_config.format` (structured outputs), que
// fuerza el formato a nivel API; repetirlo en el prompt es redundante.

const ANALISIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['modulos', 'pregunta'],
  properties: {
    modulos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'tipo', 'medida', 'descripcion', 'unidades'],
        properties: {
          nombre: { type: 'string' },
          tipo: {
            type: 'string',
            enum: ['alto', 'bajo', 'columna', 'electrodomestico', 'encimera', 'panel', 'zocalo'],
          },
          medida: { type: 'string' },
          descripcion: { type: 'string' },
          unidades: { type: 'integer' },
        },
      },
    },
    pregunta: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
};

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

// NOTA: modificado respecto a docx sec 8 (rate limiting).
// Implementación mínima como puente hasta el Paso 14: rechaza llamadas al
// mismo presupuesto_id durante 30s. Memoria local del proceso — sobrevive a
// requests dentro del mismo worker pero NO entre instancias. En Paso 14 se
// sustituye por una implementación distribuida (KV o equivalente).
const COOLDOWN_MS = 30_000;
const recientes = new Map<string, number>();

function consultarCooldown(presupuestoId: string): number {
  const ahora = Date.now();
  recientes.forEach((t, k) => {
    if (ahora - t >= COOLDOWN_MS) recientes.delete(k);
  });
  const ultimo = recientes.get(presupuestoId);
  if (ultimo === undefined) return 0;
  const restante = COOLDOWN_MS - (ahora - ultimo);
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'JSON inválido en el cuerpo.' },
      { status: 400 }
    );
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const presupuestoId = body.presupuesto_id;
  if (typeof presupuestoId !== 'string' || !presupuestoId) {
    return NextResponse.json(
      { error: 'Falta presupuesto_id en el cuerpo.' },
      { status: 400 }
    );
  }

  const respuesta =
    typeof body.respuesta === 'string' ? body.respuesta.trim() : '';
  const preguntaPrevia =
    typeof body.pregunta_previa === 'string'
      ? body.pregunta_previa.trim()
      : '';

  if (respuesta.length > 2000) {
    return NextResponse.json(
      { error: 'respuesta demasiado larga (máx 2000 caracteres).' },
      { status: 400 }
    );
  }
  if (preguntaPrevia.length > 2000) {
    return NextResponse.json(
      { error: 'pregunta_previa demasiado larga (máx 2000 caracteres).' },
      { status: 400 }
    );
  }
  if ((respuesta.length === 0) !== (preguntaPrevia.length === 0)) {
    return NextResponse.json(
      {
        error:
          'respuesta y pregunta_previa deben venir juntas o ambas ausentes.',
      },
      { status: 400 }
    );
  }
  const esFollowUp = respuesta.length > 0;

  const medidasRaw = body.medidas && typeof body.medidas === 'object'
    ? (body.medidas as Record<string, unknown>)
    : null;
  const medidas = medidasRaw
    ? {
        paredes: Array.isArray(medidasRaw.paredes)
          ? (medidasRaw.paredes as unknown[]).map((p) => String(p ?? '').trim()).filter(Boolean)
          : [],
        isla:              medidasRaw.isla === true,
        islaLongitud:      String(medidasRaw.islaLongitud      ?? '').trim(),
        islaAncho:         String(medidasRaw.islaAncho         ?? '').trim(),
        altoTecho:         String(medidasRaw.altoTecho         ?? '').trim(),
        profundidad_bajos: String(medidasRaw.profundidad_bajos ?? '').trim(),
        profundidad_altos: String(medidasRaw.profundidad_altos ?? '').trim(),
      }
    : null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  const esperaSegundos = consultarCooldown(presupuestoId);
  if (esperaSegundos > 0) {
    return NextResponse.json(
      {
        error: `Análisis reciente en curso o ya hecho. Espera ${esperaSegundos}s antes de reintentar.`,
      },
      { status: 429, headers: { 'Retry-After': String(esperaSegundos) } }
    );
  }

  // RLS scope al presupuesto.tienda_id == user_tienda_id().
  const { data: presupuesto, error: pErr } = await supabase
    .from('presupuestos')
    .select('id, imagen_url')
    .eq('id', presupuestoId)
    .maybeSingle();
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  if (!presupuesto) {
    return NextResponse.json(
      { error: 'Presupuesto no encontrado o no accesible.' },
      { status: 404 }
    );
  }
  if (!presupuesto.imagen_url) {
    return NextResponse.json(
      { error: 'El presupuesto no tiene plano subido.' },
      { status: 400 }
    );
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from('planos')
    .download(presupuesto.imagen_url);
  if (dlErr || !blob) {
    return NextResponse.json(
      {
        error: `No se pudo descargar el plano: ${dlErr?.message ?? 'desconocido'}`,
      },
      { status: 500 }
    );
  }

  const mediaType = blob.type || 'application/octet-stream';
  const isImage = IMAGE_MIME_TYPES.has(mediaType);
  const isPdf = mediaType === 'application/pdf';
  if (!isImage && !isPdf) {
    return NextResponse.json(
      { error: `Formato de plano no soportado por la IA: ${mediaType}.` },
      { status: 415 }
    );
  }

  // Marcamos antes de la llamada a la IA: bloquea reintentos por doble clic /
  // refresh accidental incluso si la IA falla. El usuario podrá reintentar
  // pasados 30s.
  recientes.set(presupuestoId, Date.now());

  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

  const planoBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64,
        },
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as
            | 'image/jpeg'
            | 'image/png'
            | 'image/webp'
            | 'image/gif',
          data: base64,
        },
      };

  const anthropic = createAnthropicClient();

  // Pantalla 4a (Paso 10): en follow-up incluimos la pregunta de la IA y la
  // respuesta del vendedor en el mismo `user` turn. El docx (sec 4) dice "la
  // respuesta del vendedor se añade al contexto del prompt para que la IA
  // complete el análisis" — coincide con esta construcción single-turn.
  const textoUsuario = esFollowUp
    ? `Analiza este plano y devuelve los módulos en JSON.

CONTEXTO DEL VENDEDOR
En tu análisis previo me preguntaste: «${preguntaPrevia}»
Respuesta del vendedor: «${respuesta}»

Incorpora esa respuesta al análisis y devuelve el JSON completo con TODOS los módulos identificados (no solo los nuevos). Si todavía tienes una duda relevante que cambie el presupuesto, ponla en "pregunta"; si no, pon null.`
    : medidas
      ? `Analiza este plano y devuelve los módulos en JSON.

MEDIDAS DE LA COCINA (proporcionadas por el vendedor):
${medidas.paredes.map((l, i) => `- Pared ${i + 1}: ${l} cm`).join('\n')}
- Altura del techo: ${medidas.altoTecho} cm
- Profundidad módulos bajos: ${medidas.profundidad_bajos} cm
- Profundidad módulos altos: ${medidas.profundidad_altos} cm
${medidas.isla ? `- Isla: sí — longitud ${medidas.islaLongitud} cm, ancho ${medidas.islaAncho} cm` : '- Isla: no'}

Usa estas medidas para calcular dimensiones reales de los módulos.`
      : 'Analiza este plano y devuelve los módulos en JSON.';

  let analisis: RespuestaAnalisisIA;
  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 4000,
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: 'json_schema', schema: ANALISIS_SCHEMA },
        effort: 'medium',
      },
      messages: [
        {
          role: 'user',
          content: [planoBlock, { type: 'text', text: textoUsuario }],
        },
      ],
    });

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text'
    );
    if (!textBlock) {
      return NextResponse.json(
        { error: 'La IA no devolvió un bloque de texto.' },
        { status: 502 }
      );
    }

    try {
      analisis = JSON.parse(textBlock.text) as RespuestaAnalisisIA;
    } catch {
      return NextResponse.json(
        { error: 'La IA devolvió contenido no parseable como JSON.' },
        { status: 502 }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error inesperado';
    return NextResponse.json(
      { error: `Fallo al llamar a la IA: ${msg}` },
      { status: 502 }
    );
  }

  // Cruce IA ↔ tarifa (Paso 9, docx sec 5.2). La consulta respeta RLS:
  // `tarifas_select_same_tienda` restringe al `tienda_id` del usuario.
  const { data: tarifasRaw, error: tErr } = await supabase
    .from('tarifas')
    .select('id, tienda_id, nombre_modulo, tipo, medida, precio, activo')
    .eq('activo', true);
  if (tErr) {
    return NextResponse.json(
      { error: `No se pudo leer la tarifa: ${tErr.message}` },
      { status: 500 }
    );
  }

  const lineasCruzadas = cruzarConTarifa(
    analisis.modulos,
    (tarifasRaw ?? []) as Tarifa[]
  );

  // NOTA: modificado respecto a docx sec 5.2 (persistencia diferida a Paso 11).
  // El docx pide guardar las líneas cruzadas en `lineas_presupuesto` aquí
  // mismo. Mantenemos el snapshot solo en memoria hasta el Paso 11 (que
  // añadirá edición inline + guardado de borrador). Hasta entonces, refrescar
  // Pantalla 4b vacía la tabla — comportamiento ya aceptado en Paso 7.
  if (analisis.pregunta) {
    await supabase
      .from('presupuestos')
      .update({ notas_ia: analisis.pregunta })
      .eq('id', presupuestoId);
  }

  return NextResponse.json({
    modulos: lineasCruzadas,
    pregunta: analisis.pregunta,
  });
}
