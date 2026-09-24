'use client'
// Ícono del carrito con contador (header público y topbar del panel) + el panel
// del carrito: Sheet desde abajo en el celu y lateral en escritorio. Se oculta
// para quien no compra (proveedor puro). Montar UNO por pantalla.
import { useEffect, useState } from 'react'
import { ShoppingCart } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCart, useCartCount, useCartSync } from '@/lib/cart'
import CartContents from './cart-contents'

function useIsDesktop() {
  const [desk, setDesk] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setDesk(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return desk
}

export default function CartButton({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  useCartSync()
  const mode = useCart((s) => s.mode)
  const open = useCart((s) => s.open)
  const setOpen = useCart((s) => s.setOpen)
  const count = useCartCount()
  const desktop = useIsDesktop()

  if (mode === 'sin_carrito') return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="top-carrito"
        aria-label={`Carrito${count ? `, ${count} producto${count === 1 ? '' : 's'}` : ', vacío'}`}
        aria-haspopup="dialog"
        className={
          tone === 'dark'
            ? 'relative grid size-11 place-items-center rounded-full text-white transition hover:bg-white/10'
            : 'relative grid size-11 place-items-center rounded-2xl border border-line bg-white/70 text-navy transition hover:bg-white'
        }
      >
        <ShoppingCart className="size-5" aria-hidden />
        {count > 0 && (
          <span
            aria-hidden
            className="homy-badge-pop absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] px-1 text-[10px] font-extrabold text-white shadow-[0_4px_12px_-4px_rgba(255,90,31,0.8)] ring-2 ring-white/70"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {/* fondo opaco (!bg): sobre el vidrio translúcido se leía el texto de la página de atrás */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side={desktop ? 'right' : 'bottom'}
          className={desktop ? 'w-full gap-0 !bg-[#F4F7FB] p-0 sm:max-w-md' : 'max-h-[90dvh] gap-0 rounded-t-[1.75rem] !bg-[#F4F7FB] p-0'}
          style={desktop ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <SheetHeader className="shrink-0 px-4 pb-2 pt-5 pr-12 text-left">
            <SheetTitle className="flex items-center gap-2 text-base font-extrabold text-[#0A2540]">
              <ShoppingCart className="size-5 text-[#1D63B8]" aria-hidden /> Tu carrito
            </SheetTitle>
            <SheetDescription className="text-xs text-slate-500">
              {count ? `${count} producto${count === 1 ? '' : 's'} · agrupados por proveedor` : 'Materiales de uno o varios proveedores en un solo pedido'}
            </SheetDescription>
          </SheetHeader>
          {open && <CartContents variant="sheet" onDone={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  )
}
