import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { PresupuestoPdfDocProps } from './pdf-types'

const TIPO_LABEL: Record<string, string> = {
  bajo: 'Bajo',
  alto: 'Alto',
  columna: 'Columna',
  electrodomestico: 'Electrodom.',
  encimera: 'Encimera',
  accesorio: 'Accesorio',
}

const fmtEur = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
function eur(n: number): string {
  return fmtEur.format(n) + ' €'
}

function makeStyles(primary: string) {
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      fontSize: 9,
      color: '#111827',
      paddingHorizontal: 40,
      paddingVertical: 36,
    },
    // ── HEADER ──────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 18,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      flex: 1,
    },
    logo: {
      maxWidth: 80,
      maxHeight: 50,
      marginRight: 10,
    },
    tiendaNombre: {
      fontSize: 14,
      fontFamily: 'Helvetica-Bold',
      color: primary,
      marginBottom: 3,
    },
    tiendaMeta: {
      fontSize: 7.5,
      color: '#6B7280',
      marginBottom: 1,
    },
    headerRight: {
      width: 150,
      alignItems: 'flex-end',
    },
    labelSmall: {
      fontSize: 7,
      color: '#6B7280',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 2,
    },
    numeroPdf: {
      fontSize: 13,
      fontFamily: 'Helvetica-Bold',
      color: '#111827',
      marginBottom: 2,
    },
    fechaText: {
      fontSize: 7.5,
      color: '#6B7280',
    },
    // ── DIVISOR ─────────────────────────────────────────────
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
      marginBottom: 12,
    },
    // ── CLIENTE ─────────────────────────────────────────────
    section: {
      marginBottom: 14,
    },
    sectionLabel: {
      fontSize: 7,
      fontFamily: 'Helvetica-Bold',
      color: '#6B7280',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    clienteNombre: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: '#111827',
      marginBottom: 2,
    },
    clienteMeta: {
      fontSize: 7.5,
      color: '#6B7280',
    },
    // ── TABLA ───────────────────────────────────────────────
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: primary,
      paddingVertical: 5,
      paddingHorizontal: 4,
    },
    tableHeaderText: {
      fontSize: 7.5,
      fontFamily: 'Helvetica-Bold',
      color: '#FFFFFF',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 5,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    },
    tableRowAlt: {
      backgroundColor: '#F9FAFB',
    },
    tableRowEdited: {
      backgroundColor: '#FFFBEB',
    },
    cellText: {
      fontSize: 8,
      color: '#111827',
    },
    cellMuted: {
      fontSize: 8,
      color: '#6B7280',
    },
    // columnas
    colModulo: { width: '35%' },
    colTipo:   { width: '12%' },
    colMedida: { width: '12%' },
    colUds:    { width: '8%', textAlign: 'right' },
    colPrecio: { width: '16.5%', textAlign: 'right' },
    colSubt:   { width: '16.5%', textAlign: 'right' },
    // ── TOTALES ─────────────────────────────────────────────
    totalesWrap: {
      marginTop: 10,
      alignItems: 'flex-end',
    },
    totalesBox: {
      width: 220,
    },
    totalesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    totalesLabel: {
      fontSize: 8,
      color: '#6B7280',
    },
    totalesValue: {
      fontSize: 8,
      color: '#111827',
    },
    totalesDivider: {
      borderBottomWidth: 1,
      borderBottomColor: '#D1D5DB',
      marginVertical: 4,
    },
    totalFinalLabel: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: primary,
    },
    totalFinalValue: {
      fontSize: 10,
      fontFamily: 'Helvetica-Bold',
      color: primary,
    },
    // ── CONDICIONES ─────────────────────────────────────────
    condiciones: {
      marginTop: 20,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
    },
    condicionesText: {
      fontSize: 7.5,
      color: '#6B7280',
      lineHeight: 1.4,
    },
  })
}

export default function PresupuestoPdfDoc({
  numeroPdf,
  fecha,
  clienteNombre,
  clienteEmail,
  clienteTelefono,
  lineas,
  tienda,
  logoBase64,
  totalNeto,
  totalIva,
  totalBruto,
}: PresupuestoPdfDocProps) {
  const s = makeStyles(tienda.color_primario)

  const contacto = [tienda.email_contacto, tienda.telefono]
    .filter(Boolean)
    .join('  ·  ')
  const clienteContacto = [clienteEmail, clienteTelefono]
    .filter(Boolean)
    .join('  ·  ')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* CABECERA */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image no es un <img> HTML */}
            {logoBase64 && <Image src={logoBase64} style={s.logo} />}
            <View>
              <Text style={s.tiendaNombre}>{tienda.nombre}</Text>
              {tienda.direccion ? (
                <Text style={s.tiendaMeta}>{tienda.direccion}</Text>
              ) : null}
              {contacto ? <Text style={s.tiendaMeta}>{contacto}</Text> : null}
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.labelSmall}>Presupuesto</Text>
            <Text style={s.numeroPdf}>Nº {numeroPdf}</Text>
            <Text style={s.fechaText}>{fecha}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* CLIENTE */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>Cliente</Text>
          <Text style={s.clienteNombre}>{clienteNombre || 'Sin nombre'}</Text>
          {clienteContacto ? (
            <Text style={s.clienteMeta}>{clienteContacto}</Text>
          ) : null}
        </View>

        {/* TABLA — CABECERA */}
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderText, s.colModulo]}>Módulo</Text>
          <Text style={[s.tableHeaderText, s.colTipo]}>Tipo</Text>
          <Text style={[s.tableHeaderText, s.colMedida]}>Medida</Text>
          <Text style={[s.tableHeaderText, s.colUds]}>Uds.</Text>
          <Text style={[s.tableHeaderText, s.colPrecio]}>Precio unit.</Text>
          <Text style={[s.tableHeaderText, s.colSubt]}>Subtotal</Text>
        </View>

        {/* TABLA — FILAS */}
        {lineas.map((linea, i) => (
          <View
            key={i}
            style={[
              s.tableRow,
              i % 2 !== 0 ? s.tableRowAlt : {},
              linea.editado_manualmente ? s.tableRowEdited : {},
            ]}
            wrap={false}
          >
            <Text style={[s.cellText, s.colModulo]}>{linea.nombre_modulo}</Text>
            <Text style={[s.cellMuted, s.colTipo]}>
              {TIPO_LABEL[linea.tipo] ?? linea.tipo}
            </Text>
            <Text style={[s.cellMuted, s.colMedida]}>{linea.medida || '—'}</Text>
            <Text style={[s.cellText, s.colUds]}>{linea.unidades}</Text>
            <Text style={[s.cellText, s.colPrecio]}>
              {eur(linea.precio_unitario)}
            </Text>
            <Text style={[s.cellText, s.colSubt]}>{eur(linea.subtotal)}</Text>
          </View>
        ))}

        {/* TOTALES */}
        <View style={s.totalesWrap}>
          <View style={s.totalesBox}>
            <View style={s.totalesRow}>
              <Text style={s.totalesLabel}>Total neto</Text>
              <Text style={s.totalesValue}>{eur(totalNeto)}</Text>
            </View>
            <View style={s.totalesRow}>
              <Text style={s.totalesLabel}>
                IVA ({tienda.iva_porcentaje}%)
              </Text>
              <Text style={s.totalesValue}>{eur(totalIva)}</Text>
            </View>
            <View style={s.totalesDivider} />
            <View style={s.totalesRow}>
              <Text style={s.totalFinalLabel}>Total</Text>
              <Text style={s.totalFinalValue}>{eur(totalBruto)}</Text>
            </View>
          </View>
        </View>

        {/* CONDICIONES COMERCIALES */}
        {tienda.condiciones_comerciales ? (
          <View style={s.condiciones}>
            <Text style={[s.sectionLabel, { marginBottom: 5 }]}>
              Condiciones comerciales
            </Text>
            <Text style={s.condicionesText}>
              {tienda.condiciones_comerciales}
            </Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
