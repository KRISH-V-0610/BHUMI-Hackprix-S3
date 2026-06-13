import { useCallback, useRef } from 'react'
import { postTts } from '../api/bhumi.js'

// Speaks text via POST /tts (Sarvam bulbul). Plays the returned base64 audio.
// Gracefully no-ops when there's no audio (e.g. mock mode returns audio_base64: null).
export function useTts() {
  const audioRef = useRef(null)

  const speak = useCallback(async (text, lang = 'en-IN') => {
    try {
      const res = await postTts(text, lang)
      if (!res?.audio_base64) return // mock mode / no audio
      const fmt = res.format || 'wav'
      const src = `data:audio/${fmt};base64,${res.audio_base64}`
      audioRef.current?.pause()
      const audio = new Audio(src)
      audioRef.current = audio
      await audio.play().catch(() => {})
    } catch (e) {
      console.warn('[bhumi] tts failed:', e.message)
    }
  }, [])

  const stop = useCallback(() => {
    audioRef.current?.pause()
  }, [])

  return { speak, stop }
}
