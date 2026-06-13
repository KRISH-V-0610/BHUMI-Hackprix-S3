// Tiny, dependency-free markdown renderer for AI answers.
// Handles the only things the agent emits: **bold**, *italic*, line breaks, and
// numbered / bulleted lists. Anything fancier just falls through as text.

// Strip markdown markers for the type-on phase (so partial "**" never flashes).
export function stripMd(s) {
  return (s || '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '')
}

// Inline: split a line into text + <strong>/<em> nodes.
function renderInline(line, keyBase) {
  const nodes = []
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index))
    if (m[2] != null) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>)
    else nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>)
    last = m.index + m[0].length
    i++
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/
const BULLET = /^\s*[-•*]\s+(.*)$/

// Block-level: group lines into paragraphs and lists.
export default function Markdown({ text, className = '' }) {
  const lines = (text || '').split('\n')
  const blocks = []
  let list = null // { type: 'ol'|'ul', items: [] }

  const flush = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
  }

  lines.forEach((raw) => {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      flush()
      return
    }
    const om = line.match(ORDERED)
    const bm = line.match(BULLET)
    if (om) {
      if (!list || list.type !== 'ol') {
        flush()
        list = { type: 'ol', items: [] }
      }
      list.items.push(om[2])
    } else if (bm) {
      if (!list || list.type !== 'ul') {
        flush()
        list = { type: 'ul', items: [] }
      }
      list.items.push(bm[1])
    } else {
      flush()
      blocks.push({ type: 'p', text: line })
    }
  })
  flush()

  return (
    <div className={`space-y-1.5 ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{renderInline(b.text, `p${i}`)}</p>
        const Tag = b.type === 'ol' ? 'ol' : 'ul'
        return (
          <Tag
            key={i}
            className={`ml-4 space-y-0.5 ${b.type === 'ol' ? 'list-decimal' : 'list-disc'}`}
          >
            {b.items.map((it, j) => (
              <li key={j}>{renderInline(it, `l${i}-${j}`)}</li>
            ))}
          </Tag>
        )
      })}
    </div>
  )
}
