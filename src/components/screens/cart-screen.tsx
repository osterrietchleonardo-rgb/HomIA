'use client'
// /carrito — el carrito a pantalla completa. Es el destino de "volver" cuando el
// visitante crea su cuenta o ingresa para confirmar: al entrar, su carrito local
// ya se fusionó con el de la cuenta y puede confirmar el pedido desde acá.
import CartContents from '@/components/cart/cart-contents'

export default function CartScreen({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className={embedded ? 'homy-page' : 'mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6'}>
      <header className={embedded ? 'homy-page-head' : 'mb-5'}>
        <div className="min-w-0">
          <p className="homy-eyebrow">Materiales</p>
          <h1 className={embedded ? 'homy-page-title mt-1.5' : 'mt-2 text-3xl font-extrabold tracking-tight text-navy'}>Tu carrito</h1>
          <p className="homy-page-sub">Productos de uno o varios proveedores, agrupados por local. Al confirmar, cada proveedor recibe su parte.</p>
        </div>
      </header>
      <CartContents variant="page" />
    </div>
  )
}
