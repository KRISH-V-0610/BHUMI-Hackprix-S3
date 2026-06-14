import { useEffect, useRef, useState } from 'react'

// Immersive audio-reactive orb shown at screen-centre while the mic records or Bhumi speaks.
// `level` (0-1) is the live RMS amplitude; bars + rings + core all breathe with the voice.
export default function AudioOrb({ level = 0, mode = 'mic' }) {
  const [t, setT] = useState(0)
  const raf = useRef(null)
  useEffect(() => {
    let start = null
    const loop = (ts) => {
      if (start == null) start = ts
      setT((ts - start) / 1000)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  const lv = Math.max(0.05, Math.min(1, level))
  const colorA = mode === 'tts' ? '#39ff88' : '#22d3ee'
  const colorB = mode === 'tts' ? '#16a34a' : '#0ea5b7'
  const N = 44

  return (
    <div className="pointer-events-none relative flex h-72 w-72 items-center justify-center">
      {/* pulsing concentric rings */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute rounded-full border-2"
          style={{
            width: `${130 + i * 50}px`,
            height: `${130 + i * 50}px`,
            borderColor: colorA,
            opacity: Math.max(0, 0.22 - i * 0.05 + lv * 0.3),
            transform: `scale(${1 + lv * 0.2 + 0.05 * Math.sin(t * 2 + i)})`,
          }}
        />
      ))}

      {/* radial frequency bars */}
      <svg width="288" height="288" viewBox="-144 -144 288 288" className="absolute">
        {Array.from({ length: N }).map((_, i) => {
          const ang = (i / N) * Math.PI * 2
          const h = 10 + (0.5 + 0.5 * Math.sin(t * 6 + i * 0.5)) * (8 + lv * 52)
          const r0 = 70
          return (
            <line
              key={i}
              x1={Math.cos(ang) * r0}
              y1={Math.sin(ang) * r0}
              x2={Math.cos(ang) * (r0 + h)}
              y2={Math.sin(ang) * (r0 + h)}
              stroke={colorA}
              strokeWidth="3"
              strokeLinecap="round"
              opacity={0.45 + lv * 0.55}
            />
          )
        })}
      </svg>

      {/* glowing core */}
      <div
        className="absolute rounded-full"
        style={{
          width: '96px',
          height: '96px',
          background: `radial-gradient(circle at 50% 38%, ${colorA}, ${colorB})`,
          transform: `scale(${0.85 + lv * 0.55})`,
          boxShadow: `0 0 ${28 + lv * 70}px ${colorA}`,
        }}
      />
      <span className="absolute bottom-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white drop-shadow">
        {mode === 'tts' ? 'Bhumi speaking' : 'Listening…'}
      </span>
    </div>
  )
}
