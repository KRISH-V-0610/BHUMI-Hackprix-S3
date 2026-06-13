import { useCallback, useRef, useState } from 'react'

// Records mic audio with MediaRecorder and returns a Blob to POST to /voice.
// Also exposes a live amplitude (0-1) for the header waveform viz.
export function useMicRecorder() {
  const [recording, setRecording] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const resolveRef = useRef(null)

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    chunksRef.current = []

    const mr = new MediaRecorder(stream)
    mediaRef.current = mr
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
    mr.start()
    setRecording(true)

    // amplitude meter for the waveform
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = ctx
    const src = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    src.connect(analyser)
    const buf = new Uint8Array(analyser.frequencyBinCount)
    const loop = () => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      setAmplitude(Math.min(1, Math.sqrt(sum / buf.length) * 3))
      rafRef.current = requestAnimationFrame(loop)
    }
    loop()
  }, [])

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setAmplitude(0)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    streamRef.current = null
    audioCtxRef.current = null
  }, [])

  // Stops recording and resolves with the recorded Blob (webm/ogg depending on browser).
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRef.current
      if (!mr) return resolve(null)
      resolveRef.current = resolve
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        cleanup()
        setRecording(false)
        resolveRef.current?.(blob)
      }
      mr.stop()
    })
  }, [cleanup])

  return { recording, amplitude, start, stop }
}
