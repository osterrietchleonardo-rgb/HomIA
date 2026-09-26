'use client'
// Mapa de pines con radio de alcance — Leaflet + OpenStreetMap (sin API key)
// El encuadre sigue al círculo de radio: centro/radio cambian → fitBounds;
// los pines se redibujan sin robar el zoom del usuario.
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'

export type MapPin = {
  id: string
  lat: number
  lng: number
  label: string
  sub?: string
  kind: 'profesional' | 'trabajo' | 'material' | 'proveedor' | 'yo'
  href?: string
  price?: string
}

const KIND_COLORS: Record<string, string> = {
  profesional: '#1D63B8',
  trabajo: '#FF5A1F',
  material: '#00A3E0',
  proveedor: '#16A34A',
  yo: '#0A2540',
}

export default function MapView({
  center,
  radiusKm,
  pins,
  onSelect,
  className = 'h-[320px] w-full rounded-3xl sm:h-[420px] lg:h-[480px]',
}: {
  center: { lat: number; lng: number } | null
  radiusKm: number
  pins: MapPin[]
  onSelect?: (pin: MapPin) => void
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const LRef = useRef<any>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  // encuadre vigente: solo re-encuadra cuando cambia el foco (centro o radio),
  // nunca cuando cambian los pines (eso mantendría el mapa "lejos" todo el tiempo)
  const focusRef = useRef<string>('')
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const renderRef = useRef<() => void>(() => {})

  // init una sola vez
  useEffect(() => {
    let cancelled = false
    async function init() {
      const L = await import('leaflet')
      if (cancelled || !ref.current || mapRef.current) return
      LRef.current = L
      const map = L.map(ref.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        zoomSnap: 0.25,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      layerRef.current = L.layerGroup().addTo(map)
      // vista provisional a escala de ciudad; el fitBounds real llega con render()
      map.setView([-34.6037, -58.3816], 10)
      // responsive: Leaflet no detecta cambios del contenedor (sidebar, paneles, giro)
      roRef.current = new ResizeObserver(() => map.invalidateSize())
      roRef.current.observe(ref.current)
      // si el primer render corrió antes de que Leaflet estuviera listo, recuperarlo acá
      renderRef.current()
    }
    init()
    return () => {
      cancelled = true
      roRef.current?.disconnect()
      roRef.current = null
    }
  }, [])

  // cleanup al desmontar
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        layerRef.current = null
      }
    }
  }, [])

  // render en cada cambio de foco / pines
  useEffect(() => {
    function render() {

      const L = LRef.current
      const map = mapRef.current
      const layer = layerRef.current
      if (!L || !map || !layer) return
      layer.clearLayers()

      const focusKey = center ? `${center.lat},${center.lng}|${radiusKm}` : 'sin-centro'
      const focusChanged = focusRef.current !== focusKey
      focusRef.current = focusKey

      let circle: any = null
      if (center) {
        circle = L.circle([center.lat, center.lng], {
          radius: radiusKm * 1000,
          color: '#00C4FF',
          weight: 1.5,
          fillColor: '#00C4FF',
          fillOpacity: 0.07,
          dashArray: '6 6',
        }).addTo(layer)
        L.circleMarker([center.lat, center.lng], {
          radius: 7,
          color: '#fff',
          weight: 2.5,
          fillColor: KIND_COLORS.yo,
          fillOpacity: 1,
        }).addTo(layer)
      }

      const pinPoints: [number, number][] = []
      for (const pin of pins) {
        if (!pin.lat || !pin.lng) continue
        pinPoints.push([pin.lat, pin.lng])
        const color = KIND_COLORS[pin.kind] || '#1D63B8'
        const el = document.createElement('div')
        el.style.cssText = `background:${color};color:#fff;border-radius:999px;padding:3px 9px;font:600 11px/1.4 system-ui;box-shadow:0 2px 8px rgba(10,37,64,.35);white-space:nowrap;cursor:pointer;border:2px solid #fff;transform:translate(-50%,-50%)`
        el.textContent = pin.price || pin.label.slice(0, 22)
        el.onclick = () => onSelectRef.current?.(pin)
        const icon = L.divIcon({ html: el, className: 'homy-pin', iconSize: [10, 10] })
        const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(layer)
        // el título lo escribe un usuario (p. ej. un trabajo publicado): se arma con nodos y textContent,
        // nunca con HTML interpolado (antes era una vía de XSS)
        const tip = document.createElement('div')
        const tipTitulo = document.createElement('b')
        tipTitulo.textContent = pin.label
        tip.appendChild(tipTitulo)
        if (pin.sub) {
          const tipSub = document.createElement('span')
          tipSub.style.color = '#64748b'
          tipSub.textContent = pin.sub
          tip.appendChild(document.createElement('br'))
          tip.appendChild(tipSub)
        }
        marker.bindTooltip(tip, {
          direction: 'top',
          offset: [0, -8],
        })
        marker.on('click', () => onSelectRef.current?.(pin))
      }

      // encuadre: solo cuando el foco cambió (o primera vez)
      if (focusChanged) {
        if (center && circle) {
          map.fitBounds(circle.getBounds().pad(0.12), { animate: true })
        } else if (pinPoints.length > 1) {
          map.fitBounds(L.latLngBounds(pinPoints).pad(0.2), { animate: true })
        } else if (pinPoints.length === 1) {
          map.setView(pinPoints[0], 13, { animate: true })
        }
      }
    }
    renderRef.current = render
    render()
  }, [center?.lat, center?.lng, radiusKm, pins])

  return (
    <div className={`relative overflow-hidden border border-slate-200/80 shadow-sm bg-[#E8EDF2] ${className}`}>
      <div ref={ref} className="h-full w-full z-0" />
      <div className="homy-glass-soft absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-2 rounded-full px-3 py-1.5 text-[10px] font-semibold shadow pointer-events-none" aria-hidden>
        {Object.entries(KIND_COLORS).map(([kind, color]) => (
          <span key={kind} className="flex items-center gap-1 capitalize text-slate-600">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
            {kind === 'yo' ? 'vos' : kind}
          </span>
        ))}
      </div>
    </div>
  )
}
