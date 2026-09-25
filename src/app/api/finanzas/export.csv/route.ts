import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { sesionConRol, periodoDeQuery } from '@/lib/finanzas/servidor'
import { cargarEntrada } from '@/lib/finanzas/datos'
import { reporte, movimientosDelPeriodo, claveDia } from '@/lib/finanzas/calculos'
import { nombreCategoria } from '@/lib/finanzas/conceptos'

// GET /api/finanzas/export.csv?role=&periodo=… (o desde/hasta) → CSV para Excel en español:
// separador ";" y montos con coma decimal (1.234,56), con BOM UTF-8 para que Excel lea los acentos.
// Dos bloques: estado de resultados del período y todos los movimientos (automáticos y manuales).

/** 1234.5 → "1.234,50" (formato argentino que Excel en español toma como número). */
function montoAR(n: number): string {
  const s = Math.abs(n).toFixed(2)
  const [ent, dec] = s.split('.')
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`
}
const celda = (v: string) => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const fecha = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const s = await sesionConRol(sp.get('role'))
  if ('response' in s) return s.response
  const hoy = new Date()
  const per = periodoDeQuery(sp, hoy)
  if ('error' in per) return fail(per.error, 400)
  const { entrada } = await cargarEntrada(s.user.id, s.rol, hoy)
  const r = reporte(entrada, per.p)
  const R = r.resultados
  const movs = movimientosDelPeriodo(entrada, per.p.desde, per.p.hasta)

  const filas: string[][] = [
    ['HomIA · Finanzas', s.rol === 'profesional' ? 'Profesional' : 'Proveedor'],
    ['Período', r.periodo.etiqueta],
    ['Generado', fecha(claveDia(hoy))],
    [],
    ['ESTADO DE RESULTADOS', 'Pesos'],
    ['Ventas de HomIA', montoAR(R.ventasHomia)],
    ['Ventas por fuera de HomIA', montoAR(R.ventasFuera)],
    ['Ventas brutas', montoAR(R.ventasBrutas)],
    ['Devoluciones', montoAR(-R.devoluciones)],
    ['Ventas netas', montoAR(R.ventasNetas)],
    ['Costo directo', montoAR(-R.costoDirecto)],
    ['Margen bruto', montoAR(R.margenBruto)],
    ['Gastos fijos', montoAR(-R.gastos)],
    ['Resultado operativo', montoAR(R.resultadoOperativo)],
    ['Amortizaciones', montoAR(-R.amortizaciones)],
    ['Intereses', montoAR(-R.intereses)],
    ['Resultado neto', montoAR(R.resultadoNeto)],
    ['Retiros del dueño (no son gasto)', montoAR(R.retiros)],
    [],
    ['MOVIMIENTOS'],
    ['Fecha', 'Origen', 'Tipo', 'Categoría', 'Descripción', 'Estado', 'Entra', 'Sale'],
    ...movs.map((m) => [
      fecha(m.fecha),
      m.origen === 'auto' ? 'Automático (HomIA)' : m.proyectado ? 'Manual (mensual)' : 'Manual',
      m.nombre,
      nombreCategoria(m.categoria),
      m.descripcion,
      m.estado === 'por_cobrar' ? 'Por cobrar' : m.estado === 'cobrado' ? 'Cobrado' : m.estado === 'pendiente' ? 'Pendiente' : 'Pagado',
      m.entra ? montoAR(m.monto) : '',
      m.entra ? '' : montoAR(m.monto),
    ]),
  ]
  const csv = '﻿' + filas.map((f) => f.map((c) => celda(c ?? '')).join(';')).join('\r\n') + '\r\n'
  const nombre = `homia-finanzas-${s.rol}-${claveDia(per.p.desde)}.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
