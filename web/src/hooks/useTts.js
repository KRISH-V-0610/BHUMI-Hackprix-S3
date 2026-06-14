import { useCallback, useRef, useState } from 'react'
import { postTts } from '../api/bhumi.js'

// Speaks text via POST /tts (Sarvam bulbul). Plays the returned base64 audio AND exposes a live
// `level` (0-1 RMS amplitude) + `playing` flag so the agent console can render an audio-reactive
// orb that vibrates with the actual voice. Gracefully no-ops when there's no audio (mock mode).
export function useTts() {
  const audioRef = useRef(null)
  const ctxRef = useRef(null)
  const rafRef = useRef(null)
  const [level, setLevel] = useState(0)
  const [playing, setPlaying] = useState(false)

  const speak = useCallback(async (text, lang = 'en-IN', { onEnd } = {}) => {
    try {
      const res = await postTts(text, lang)
      if (!res?.audio_base64) {
        onEnd?.()
        return
      }
      const fmt = res.format || 'wav'
      const src = `data:audio/${fmt};base64,${res.audio_base64}`
      audioRef.current?.pause()
      const audio = new Audio(src)
      audioRef.current = audio

      // Wire an analyser so `level` tracks the real waveform.
      let analyser = null
      let buf = null
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext
        const ctx = ctxRef.current || (ctxRef.current = new Ctx())
        ctx.resume?.()
        const node = ctx.createMediaElementSource(audio)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        node.connect(analyser)
        analyser.connect(ctx.destination)
        buf = new Uint8Array(analyser.frequencyBinCount)
      } catch {
        analyser = null
      }

      const loop = () => {
        if (analyser) {
          analyser.getByteTimeDomainData(buf)
          let sum = 0
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128
            sum += v * v
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3))
        } else {
          setLevel(0.35 + 0.3 * Math.abs(Math.sin(performance.now() / 130))) // synthetic fallback
        }
        rafRef.current = requestAnimationFrame(loop)
      }

      const end = () => {
        cancelAnimationFrame(rafRef.current)
        setPlaying(false)
        setLevel(0)
        onEnd?.()
      }
      audio.onended = end
      setPlaying(true)
      await audio.play().catch(end)
      loop()
    } catch (e) {
      console.warn('[bhumi] tts failed:', e.message)
      setPlaying(false)
      onEnd?.()
    }
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    cancelAnimationFrame(rafRef.current)
    setPlaying(false)
    setLevel(0)
  }, [])

  return { speak, stop, level, playing }
}
