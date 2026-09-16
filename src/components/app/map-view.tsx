'use client'
// Mapa de pines con radio de alcance — Leaflet + OpenStreetMap (sin API key)
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
  className = 'h-[380px] w-full rounded-2xl',
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

  useEffect(() => {
    let cancelled = false
    async function init() {
      const L = await import('leaflet')
      if (cancelled || !ref.current || mapRef.current) return
      LRef.current = L
      const map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      mapRef.current = map
      layerRef.current = L.layerGroup().addTo(map)
      map.setView(center ? [center.lat, center.lng] : [-34.6037, -58.3816], center ? 12 : 4)
      render()
    }
    function render() {
      const L = LRef.current
      const map = mapRef.current
      const layer = layerRef.current
      if (!L || !map || !layer) return
      layer.clearLayers()
      if (center) {
        L.circle([center.lat, center.lng], {
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
      for (const pin of pins) {
        if (!pin.lat || !pin.lng) continue
        const color = KIND_COLORS[pin.kind] || '#1D63B8'
        const el = document.createElement('div')
        el.style.cssText = `background:${color};color:#fff;border-radius:999px;padding:3px 9px;font:600 11px/1.4 system-ui;box-shadow:0 2px 8px rgba(10,37,64,.35);white-space:nowrap;cursor:pointer;border:2px solid #fff`
        el.textContent = pin.price || pin.label.slice(0, 22)
        el.onclick = () => onSelect?.(pin)
        const icon = L.divIcon({ html: el, className: 'homy-pin', iconSize: [10, 10] })
        const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(layer)
        marker.bindTooltip(`<b>${pin.label}</b>${pin.sub ? `<br/><span style="color:#64748b">${pin.sub}</span>` : ''}`, {
          direction: 'top',
          offset: [0, -8],
        })
        marker.on('click', () => onSelect?.(pin))
      }
    }
    init()
    render()
    // re-centrar cuando cambia el centro
    if (mapRef.current && center) {
      mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom() || 12, { animate: true })
    }
    return () => {
      cancelled = true
    }
     
  }, [center?.lat, center?.lng, radiusKm, JSON.stringify(pins.map((p) => p.id + p.lat + p.lng))])

  useEffect(() => {
    // cleanup al desmontar
    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div className={`relative overflow-hidden border border-slate-200/80 shadow-sm bg-[#E8EDF2] ${className}`}>
      <div ref={ref} className="h-full w-full z-0" />
      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap gap-2 rounded-xl bg-white/90 backdrop-blur px-3 py-1.5 text-[10px] font-semibold shadow pointer-events-none">
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
