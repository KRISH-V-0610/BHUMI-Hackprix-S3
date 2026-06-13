import { useCallback, useRef, useState } from 'react'

// Records mic audio and returns a 16 kHz mono WAV Blob to POST to /voice.
// MediaRecorder gives us webm/opus (or mp4 on Safari); Sarvam STT wants PCM WAV, so on stop
// we decode the recording and re-encode it as a clean 16 kHz mono WAV (contracts.md: "16 kHz
// mono preferred"). Also exposes a live amplitude (0-1) for the mic waveform pulse.
const TARGET_RATE = 16000

// Downsample a Float32 PCM channel to `outRate` by block-averaging.
function downsample(input, inRate, outRate) {
  if (outRate >= inRate) return input
  const ratio = inRate / outRate
  const outLen = Math.round(input.length / ratio)
  const out = new Float32Array(outLen)
  let oi = 0
  let ii = 0
  while (oi < outLen) {
    const next = Math.round((oi + 1) * ratio)
    let acc = 0
    let cnt = 0
    for (let i = ii; i < next && i < input.length; i++) {
      acc += input[i]
      cnt++
    }
    out[oi] = cnt ? acc / cnt : 0
    oi++
    ii = next
  }
  return out
}

// Encode a Float32 PCM channel as a 16-bit mono WAV Blob.
function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (off, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // format = PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeStr(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([view], { type: 'audio/wav' })
}

async function toWav(blob) {
  const arrBuf = await blob.arrayBuffer()
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ac = new Ctx()
  try {
    const audioBuf = await ac.decodeAudioData(arrBuf)
    const mono = downsample(audioBuf.getChannelData(0), audioBuf.sampleRate, TARGET_RATE)
    return encodeWav(mono, TARGET_RATE)
  } finally {
    ac.close().catch(() => {})
  }
}

export function useMicRecorder() {
  const [recording, setRecording] = useState(false)
  const [amplitude, setAmplitude] = useState(0)
  const mediaRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream
    chunksRef.current = []

    const mr = new MediaRecorder(stream)
    mediaRef.current = mr
    mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
    mr.start()
    setRecording(true)

    // amplitude meter for the mic pulse
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

  // Stop recording and resolve with a 16 kHz mono WAV Blob (null if nothing was captured).
  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const mr = mediaRef.current
      if (!mr) return resolve(null)
      mr.onstop = async () => {
        const raw = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        cleanup()
        setRecording(false)
        if (!raw.size) return resolve(null)
        try {
          resolve(await toWav(raw))
        } catch (e) {
          console.warn('[bhumi] WAV encode failed, sending raw blob:', e?.message)
          resolve(raw) // backend can still try; better than dropping the turn
        }
      }
      mr.stop()
    })
  }, [cleanup])

  return { recording, amplitude, start, stop }
}
