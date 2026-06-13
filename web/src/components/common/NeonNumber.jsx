import { useEffect, useRef, useState } from 'react'

// Count-up number with a neon glow. Tweens from its previous value to `value` on change.
export default function NeonNumber({ value = 0, color = '#39ff14', className = '' }) {
  const [display, setDisplay] = useState(value)
  const from = useRef(value)
  const raf = useRef(null)

  useEffect(() => {
    const start = from.current
    const end = value
    const dur = 700
    let t0 = null
    const tick = (t) => {
      if (t0 == null) t0 = t
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(start + (end - start) * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else from.current = end
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value])

  return (
    <span className={className} style={{ color, textShadow: `0 0 14px ${color}66` }}>
      {display}
    </span>
  )
}
