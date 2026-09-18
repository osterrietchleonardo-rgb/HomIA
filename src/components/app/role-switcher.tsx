'use client'
// RoleSwitcher HomIA — cambia de perfil (cliente / profesional / proveedor) con menú de vidrio.
// Reemplaza al <select> nativo: la lista del navegador rompía el sistema de diseño glass.
// Contrato de animación: solo transform/opacity (framer-motion), click-fuera y Escape cierran.
import { useEffect, useRef, useState } from 'react'
import { navigate } from '@/lib/router'
import { Check, ChevronDown, HardHat, Store, User } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

type RoleMeta = { icon: React.ComponentType<{ className?: string }>; label: string; desc: string }

const ROLE_META: Record<string, RoleMeta> = {
  cliente: { icon: User, label: 'Cliente', desc: 'Publicás, aprobás y pagás' },
  profesional: { icon: HardHat, label: 'Profesional', desc: 'Ofertás, ejecutás y cobrás' },
  proveedor: { icon: Store, label: 'Proveedor', desc: 'Vendés a profesionales' },
}

export default function RoleSwitcher({ roles, role }: { roles: string[]; role: string }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // click fuera + Escape cierran
  useEffect(() => {
    if (!open) return
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = ROLE_META[role] || { icon: User, label: role, desc: '' }
  const CurrentIcon = current.icon

  function pick(r: string) {
    setOpen(false)
    if (r !== role) navigate(`/panel/${r}`)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Perfil actual: ${current.label}. Cambiar de perfil`}
        className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold outline-none transition ${
          open
            ? 'bg-white/15 border-white/25 text-white'
            : 'bg-white/10 border-white/15 text-white hover:bg-white/15'
        } focus-visible:ring-2 focus-visible:ring-[#66dfff]/60`}
      >
        <span className="grid size-5 place-items-center rounded-full bg-white/10 ring-1 ring-white/15" aria-hidden>
          <CurrentIcon className="size-3" />
        </span>
        Perfil: {current.label}
        <ChevronDown className={`size-3.5 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Cambiar de perfil"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="homy-glass-strong absolute right-0 top-full z-50 mt-2.5 w-[264px] origin-top-right rounded-2xl p-2 shadow-[0_24px_60px_-24px_rgba(10,37,64,0.5)]"
          >
            <p className="homy-eyebrow px-2.5 pb-1.5 pt-1.5 !text-[0.62rem]">Tus perfiles</p>
            <div className="homy-stagger space-y-1">
              {roles.map((r) => {
                const meta = ROLE_META[r] || { icon: User, label: r, desc: '' }
                const Icon = meta.icon
                const active = r === role
                return (
                  <button
                    key={r}
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => pick(r)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-all duration-300 ${
                      active
                        ? 'bg-gradient-to-r from-[#1D63B8]/12 to-[#00C4FF]/12 ring-1 ring-[#1D63B8]/25'
                        : 'hover:bg-white/70'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`grid size-9 shrink-0 place-items-center rounded-xl transition-shadow ${
                        active
                          ? 'bg-gradient-to-br from-[#1D63B8] to-[#2b7fd0] text-white shadow-[0_10px_22px_-10px_rgba(29,99,184,0.8)]'
                          : 'homy-glass-soft text-[#0A2540]/70 group-hover:text-[#0A2540]'
                      }`}
                    >
                      <Icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-[#0A2540]">{meta.label}</span>
                      {meta.desc && <span className="block truncate text-[11px] font-medium text-slate-500">{meta.desc}</span>}
                    </span>
                    {active && <Check className="size-4 shrink-0 text-[#1D63B8]" aria-hidden />}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
