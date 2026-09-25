'use client'
// Términos y Condiciones / Política de Privacidad (contenido en src/lib/legal-content.ts).
// Pensadas para leerse en el celu: resumen "En pocas palabras", índice (desplegable en móvil,
// fijo al costado en escritorio), tablas que en 390 px se vuelven tarjetas y datos de contacto
// reales (variables NEXT_PUBLIC_LEGAL_*) o un aviso honesto si faltan.
import { useState } from 'react'
import { navigate } from '@/lib/router'
import { ArrowLeft, Check, ChevronDown, FileText, Info, Printer, ShieldCheck } from 'lucide-react'
import { LEGAL_VERSION, PRIVACIDAD, TERMINOS, TITULAR, type LegalBlock, type LegalDoc } from '@/lib/legal-content'

const EMPRESA = TITULAR

function fechaLegible(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

// Espera un frame: en el celu el índice se cierra al elegir y eso corre el contenido hacia
// arriba; si el scroll arranca antes, termina pasado del título de la sección.
function irA(id: string) {
  window.setTimeout(() => {
    document.getElementById(`legal-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, 60)
}

function Bloque({ b }: { b: LegalBlock }) {
  if (typeof b === 'string') {
    return <p className="text-[15px] leading-relaxed text-slate-700">{b}</p>
  }
  if ('lista' in b) {
    return (
      <ul className="space-y-2">
        {b.lista.map((item) => (
          <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
            <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-[#1D63B8]" aria-hidden />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  if ('nota' in b) {
    return (
      <div className="flex gap-3 rounded-2xl border border-[#1D63B8]/15 bg-[#1D63B8]/[0.06] p-4">
        <Info className="mt-0.5 size-5 shrink-0 text-[#1D63B8]" aria-hidden />
        <p className="min-w-0 text-sm leading-relaxed text-slate-700">{b.nota}</p>
      </div>
    )
  }
  const { columnas, filas } = b.tabla
  return (
    <>
      {/* celu: cada fila es una tarjeta (nada se desborda en 390 px) */}
      <div className="space-y-2.5 sm:hidden">
        {filas.map((fila) => (
          <div key={fila.join('|')} className="homy-glass-soft rounded-2xl p-3.5">
            <p className="text-[15px] font-bold text-[#0A2540]">{fila[0]}</p>
            <dl className="mt-1.5 space-y-1.5">
              {fila.slice(1).map((celda, i) => (
                <div key={columnas[i + 1]}>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{columnas[i + 1]}</dt>
                  <dd className="text-sm leading-relaxed text-slate-700">{celda}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {/* tablet y escritorio: tabla */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 sm:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-[#0A2540]/[0.04]">
            <tr>
              {columnas.map((c) => (
                <th key={c} scope="col" className="px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={fila.join('|')} className="border-t border-slate-200/80 align-top">
                {fila.map((celda, i) => (
                  <td key={i} className={`px-4 py-3 leading-relaxed ${i === 0 ? 'font-semibold text-[#0A2540]' : 'text-slate-700'}`}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Indice({ doc, onElegir }: { doc: LegalDoc; onElegir?: () => void }) {
  return (
    <ol className="space-y-0.5">
      {doc.secciones.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => { onElegir?.(); irA(s.id) }}
            className="homy-focus w-full rounded-lg px-2.5 py-2 text-left text-sm leading-snug text-slate-600 transition hover:bg-[#1D63B8]/[0.07] hover:text-[#1D63B8]"
          >
            {s.titulo}
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => { onElegir?.(); irA('contacto') }}
          className="homy-focus w-full rounded-lg px-2.5 py-2 text-left text-sm leading-snug text-slate-600 transition hover:bg-[#1D63B8]/[0.07] hover:text-[#1D63B8]"
        >
          Contacto
        </button>
      </li>
    </ol>
  )
}

export default function LegalScreen({ tipo }: { tipo: 'terminos' | 'privacidad' }) {
  const esTerminos = tipo === 'terminos'
  const doc = esTerminos ? TERMINOS : PRIVACIDAD
  const Icono = esTerminos ? FileText : ShieldCheck
  const hayEmpresa = Boolean(EMPRESA.nombre && EMPRESA.email)
  const [indiceAbierto, setIndiceAbierto] = useState(false)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? window.history.back() : navigate('/'))}
          className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[#1D63B8]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Volver
        </button>

        {/* cambiar de documento */}
        <div role="tablist" aria-label="Documento legal" className="homy-glass-soft inline-flex rounded-2xl p-1">
          {([['terminos', 'Términos'], ['privacidad', 'Privacidad']] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tipo === id}
              onClick={() => tipo !== id && navigate(`/${id}`)}
              className={`homy-focus min-h-[44px] rounded-xl px-4 text-sm font-bold transition ${tipo === id ? 'bg-[#0A2540] text-white shadow-sm' : 'text-slate-600 hover:text-[#0A2540]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <header className="mt-5">
        <span className="homy-icon-chip homy-chip-blue size-12"><Icono className="size-6" aria-hidden /></span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#0A2540] sm:text-4xl">{doc.titulo}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-600">{doc.bajada}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span>Vigente desde el {fechaLegible(LEGAL_VERSION)}</span>
          <button
            type="button"
            onClick={() => window.print()}
            className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-lg font-semibold text-[#1D63B8] print:hidden"
          >
            <Printer className="size-4" aria-hidden /> Imprimir o guardar en PDF
          </button>
        </div>
      </header>

      {/* En pocas palabras */}
      <section aria-label="En pocas palabras" className="homy-glass-strong mt-6 rounded-3xl p-5 sm:p-7">
        <span className="homy-eyebrow">En pocas palabras</span>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {doc.resumen.map((r) => (
            <li key={r} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-[#0e9f6e]/12 text-[#0e9f6e]">
                <Check className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">{r}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Este resumen te orienta. Lo que vale es el texto completo de abajo.
        </p>
      </section>

      <div className="mt-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-8">
        {/* índice: desplegable en celu, fijo al costado en escritorio */}
        <nav aria-label="Índice" className="print:hidden">
          <div className="homy-glass-soft rounded-2xl lg:hidden">
            <button
              type="button"
              onClick={() => setIndiceAbierto((v) => !v)}
              aria-expanded={indiceAbierto}
              className="homy-focus flex min-h-[48px] w-full items-center justify-between px-4 text-sm font-bold text-[#0A2540]"
            >
              Índice ({doc.secciones.length} secciones)
              <ChevronDown className={`size-4 transition ${indiceAbierto ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {indiceAbierto && (
              <div className="border-t border-slate-200/70 p-2">
                <Indice doc={doc} onElegir={() => setIndiceAbierto(false)} />
              </div>
            )}
          </div>
          <div className="sticky top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto lg:block">
            <p className="px-2.5 pb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Índice</p>
            <Indice doc={doc} />
          </div>
        </nav>

        <article className="homy-glass mt-6 space-y-9 rounded-3xl p-5 sm:p-8 lg:mt-0">
          {doc.secciones.map((s) => (
            <section key={s.id} id={`legal-${s.id}`} className="scroll-mt-24">
              <h2 className="text-lg font-extrabold text-[#0A2540] sm:text-xl">{s.titulo}</h2>
              <div className="mt-3 space-y-3">
                {s.bloques.map((b, i) => <Bloque key={i} b={b} />)}
              </div>
            </section>
          ))}

          <section id="legal-contacto" className="scroll-mt-24 border-t border-slate-200/70 pt-7">
            <h2 className="text-lg font-extrabold text-[#0A2540] sm:text-xl">Quiénes somos y cómo contactarnos</h2>
            {hayEmpresa ? (
              <div className="mt-3 space-y-1.5 text-[15px] leading-relaxed text-slate-700">
                <p>HomIA es un servicio de <strong className="text-[#0A2540]">{EMPRESA.nombre}</strong>{EMPRESA.cuit ? `, CUIT ${EMPRESA.cuit}` : ''}.</p>
                {EMPRESA.domicilio && <p>Domicilio: {EMPRESA.domicilio}</p>}
                <p>
                  Consultas, reclamos y ejercicio de tus derechos:{' '}
                  <a className="font-semibold text-[#1D63B8] underline" href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[15px] leading-relaxed text-slate-700">
                Todavía no publicamos acá la razón social, el CUIT, el domicilio y el email de contacto de la empresa.
              </p>
            )}
          </section>
        </article>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500 print:hidden">
        {esTerminos ? (
          <>Mirá también nuestra <button type="button" onClick={() => navigate('/privacidad')} className="homy-focus font-semibold text-[#1D63B8] underline">Política de Privacidad</button>.</>
        ) : (
          <>Mirá también los <button type="button" onClick={() => navigate('/terminos')} className="homy-focus font-semibold text-[#1D63B8] underline">Términos y Condiciones</button>.</>
        )}
      </p>
    </div>
  )
}
