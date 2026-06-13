// Tiny, dependency-free markdown renderer for AI answers. Tuned for the chat bubble.
// Block:  # headings, paragraphs, ordered / bulleted lists, > blockquotes, ``` code fences,
//         --- horizontal rules, and GitHub-style pipe tables.
// Inline: **bold**, *italic*, `code`, and [links](url).
// Anything fancier falls through as plain text.

// Strip markdown markers for the type-on phase (so partial syntax never flashes) and for TTS.
export function stripMd(s) {
  return (s || '')
    .replace(/```[\s\S]*?```/g, ' ') // code fences
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images → label
    .replace(/^#{1,6}\s+/gm, '') // heading hashes
    .replace(/^>\s?/gm, '') // blockquote markers
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ') // horizontal rules
    .replace(/\|/g, ' ') // table pipes → spaces
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
}

// Inline: split a line into text + <strong>/<em>/<code>/<a> nodes.
function renderInline(line, keyBase) {
  const nodes = []
  // order matters: code first (so ** inside code isn't parsed), then links, bold, italic.
  const re = /(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g
  let last = 0
  let m
  let i = 0
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) nodes.push(line.slice(last, m.index))
    if (m[2] != null) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="rounded bg-black/5 px-1 py-0.5 font-mono text-[0.85em] text-ink">
          {m[2]}
        </code>
      )
    } else if (m[3] != null) {
      nodes.push(
        <a
          key={`${keyBase}-a${i}`}
          href={m[5]}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-neon-deep underline decoration-neon/40 underline-offset-2 hover:decoration-neon"
        >
          {m[4]}
        </a>
      )
    } else if (m[7] != null) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[7]}</strong>)
    } else if (m[9] != null) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[9]}</em>)
    }
    last = m.index + m[0].length
    i++
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}

const HEADING = /^(#{1,6})\s+(.*)$/
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/
const BULLET = /^\s*[-•*]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const RULE = /^\s*([-*_])\1{2,}\s*$/
const FENCE = /^\s*```/

// Table rows are bounded by (or contain) pipes; the separator is the |---|---| line.
const isRow = (l) => /\|/.test(l) && l.trim().length > 0
const isSep = (l) => /^[\s|:-]+$/.test(l) && l.includes('-') && l.includes('|')

function cells(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

const H_CLASS = {
  1: 'text-base font-bold text-ink mt-1',
  2: 'text-sm font-bold text-ink mt-1',
  3: 'text-[13px] font-semibold text-ink',
  4: 'text-[13px] font-semibold text-ink-dim',
  5: 'text-xs font-semibold text-ink-dim',
  6: 'text-xs font-semibold text-ink-dim',
}

// Block-level parser.
export default function Markdown({ text, className = '' }) {
  const lines = (text || '').split('\n')
  const blocks = []
  let list = null // { type: 'ol'|'ul', items: [] }
  let quote = null // string[]

  const flush = () => {
    if (list) {
      blocks.push(list)
      list = null
    }
    if (quote) {
      blocks.push({ type: 'quote', lines: quote })
      quote = null
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, '')

    // Fenced code block: ``` ... ```
    if (FENCE.test(line)) {
      flush()
      const code = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', text: code.join('\n') })
      continue
    }

    // Table: header row immediately followed by a |---|---| separator.
    if (isRow(line) && i + 1 < lines.length && isSep(lines[i + 1])) {
      flush()
      const header = cells(line)
      const rows = []
      i += 2
      while (i < lines.length && isRow(lines[i]) && !isSep(lines[i])) {
        rows.push(cells(lines[i]))
        i++
      }
      i--
      blocks.push({ type: 'table', header, rows })
      continue
    }

    if (!line.trim()) {
      flush()
      continue
    }

    if (RULE.test(line)) {
      flush()
      blocks.push({ type: 'hr' })
      continue
    }

    const hm = line.match(HEADING)
    if (hm) {
      flush()
      blocks.push({ type: 'h', level: hm[1].length, text: hm[2] })
      continue
    }

    const qm = line.match(QUOTE)
    if (qm) {
      if (!quote) {
        flush()
        quote = []
      }
      quote.push(qm[1])
      continue
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
  }
  flush()

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'p') return <p key={i}>{renderInline(b.text, `p${i}`)}</p>

        if (b.type === 'h') {
          const Tag = `h${Math.min(b.level, 6)}`
          return (
            <Tag key={i} className={H_CLASS[b.level] || H_CLASS[6]}>
              {renderInline(b.text, `h${i}`)}
            </Tag>
          )
        }

        if (b.type === 'hr') return <hr key={i} className="border-0 border-t border-black/10" />

        if (b.type === 'quote') {
          return (
            <blockquote
              key={i}
              className="border-l-2 border-neon/40 bg-neon/5 px-3 py-1.5 text-ink/90"
            >
              {b.lines.map((q, j) => (
                <p key={j}>{renderInline(q, `q${i}-${j}`)}</p>
              ))}
            </blockquote>
          )
        }

        if (b.type === 'code') {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-black/4 p-2.5 font-mono text-[11.5px] leading-relaxed text-ink ring-1 ring-black/10"
            >
              <code>{b.text}</code>
            </pre>
          )
        }

        if (b.type === 'table') {
          return (
            <div key={i} className="overflow-x-auto rounded-lg ring-1 ring-black/10">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="bg-neon/10 text-left">
                    {b.header.map((h, j) => (
                      <th key={j} className="px-2.5 py-1.5 font-semibold text-ink">
                        {renderInline(h, `th${i}-${j}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, r) => (
                    <tr key={r} className="border-t border-black/5 odd:bg-black/2">
                      {row.map((c, j) => (
                        <td key={j} className="px-2.5 py-1.5 text-ink/90 tabular-nums">
                          {renderInline(c, `td${i}-${r}-${j}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        const Tag = b.type === 'ol' ? 'ol' : 'ul'
        return (
          <Tag
            key={i}
            className={`ml-4 space-y-1 marker:text-neon-deep ${
              b.type === 'ol' ? 'list-decimal' : 'list-disc'
            }`}
          >
            {b.items.map((it, j) => (
              <li key={j} className="pl-0.5">
                {renderInline(it, `l${i}-${j}`)}
              </li>
            ))}
          </Tag>
        )
      })}
    </div>
  )
}
