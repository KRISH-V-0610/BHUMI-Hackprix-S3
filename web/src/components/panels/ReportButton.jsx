import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { postReport } from '../../api/bhumi.js'
import { USE_MOCK } from '../../api/client.js'
import { useDashboard } from '../../store/useDashboard.js'

// Generate Action Report (PDF) — POST /report -> blob download.
// In mock mode there's no backend to render a PDF, so the button explains that.
export default function ReportButton() {
  const [busy, setBusy] = useState(false)
  const lang = useDashboard((s) => s.lang)
  const year = useDashboard((s) => s.year)
  const activeLayer = useDashboard((s) => s.activeLayer)
  const highlightWards = useDashboard((s) => s.highlightWards)

  const onClick = async () => {
    setBusy(true)
    try {
      const blob = await postReport({
        lang,
        year,
        layer: activeLayer,
        wards: highlightWards,
      })
      if (!blob) {
        alert('Report PDF needs the live backend (set VITE_USE_MOCK=false and run the API).')
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'bhumi-action-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert(`Report failed: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex h-8 items-center gap-1.5 rounded-xl bg-neon-deep px-3 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      title={USE_MOCK ? 'Requires the live backend' : 'Download PDF action plan'}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={14} />}
      Council Report
    </button>
  )
}
