// Tarjeta de la imagen para compartir (og:image y twitter:image), 1200×630.
// La usan src/app/opengraph-image.tsx y src/app/twitter-image.tsx con ImageResponse (next/og):
// solo estilos en línea y flexbox (lo que soporta el renderizador de next/og).
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_ALT = 'HomIA: arreglá tu casa y pagá al terminar'

export function HomiaShareCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, #0A2540 0%, #0F3460 70%, #13407A 100%)',
        padding: '72px 80px',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
      }}
    >
      {/* marca: casita con el acento naranja + nombre */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 28,
            background: '#FF5A1F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            <path d="M10 21v-6h4v6" />
          </svg>
        </div>
        <div style={{ display: 'flex', fontSize: 120, fontWeight: 800, letterSpacing: -4, lineHeight: 1 }}>
          <span>Hom</span>
          <span style={{ color: '#FF5A1F' }}>IA</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.1 }}>
          Arreglá tu casa y pagá al terminar
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 10, height: 44, borderRadius: 5, background: '#FF5A1F', flexShrink: 0 }} />
          <div style={{ fontSize: 34, color: 'rgba(255,255,255,0.82)', lineHeight: 1.3 }}>
            Profesionales con reseñas y materiales de varios proveedores. Gratis para clientes.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, color: 'rgba(255,255,255,0.6)' }}>
        <div style={{ width: 12, height: 12, borderRadius: 6, background: '#FF5A1F' }} />
        <span>somoshomia.com</span>
      </div>
    </div>
  )
}
