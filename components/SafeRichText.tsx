'use client'

import type { ReactNode } from 'react'

type SafeRichTextProps = {
  text: string
  className?: string
}

function safeHref(value: string) {
  const href = value.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) return href
  return null
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let cursor = 0
  let match: RegExpExecArray | null
  let part = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))

    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-bold-${part++}`}>{token.slice(2, -2)}</strong>)
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      const href = link ? safeHref(link[2]) : null
      if (link && href) {
        nodes.push(
          <a key={`${keyPrefix}-link-${part++}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>
            {link[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }

    cursor = match.index + token.length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export default function SafeRichText({ text, className }: SafeRichTextProps) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let blockKey = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const content = renderInline(heading[2], `heading-${blockKey}`)
      if (level === 1) blocks.push(<h2 key={`block-${blockKey++}`}>{content}</h2>)
      else if (level === 2) blocks.push(<h3 key={`block-${blockKey++}`}>{content}</h3>)
      else blocks.push(<h4 key={`block-${blockKey++}`}>{content}</h4>)
      index += 1
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(
          <li key={`item-${blockKey}-${items.length}`}>
            {renderInline(lines[index].replace(/^[-*]\s+/, ''), `ul-${blockKey}-${items.length}`)}
          </li>,
        )
        index += 1
      }
      blocks.push(<ul key={`block-${blockKey++}`}>{items}</ul>)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(
          <li key={`item-${blockKey}-${items.length}`}>
            {renderInline(lines[index].replace(/^\d+\.\s+/, ''), `ol-${blockKey}-${items.length}`)}
          </li>,
        )
        index += 1
      }
      blocks.push(<ol key={`block-${blockKey++}`}>{items}</ol>)
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{1,3})\s+/.test(lines[index]) &&
      !/^[-*]\s+/.test(lines[index]) &&
      !/^\d+\.\s+/.test(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }

    blocks.push(
      <p key={`block-${blockKey++}`}>
        {paragraphLines.map((paragraphLine, lineIndex) => (
          <span key={`line-${lineIndex}`}>
            {lineIndex > 0 && <br />}
            {renderInline(paragraphLine, `p-${blockKey}-${lineIndex}`)}
          </span>
        ))}
      </p>,
    )
  }

  return <div className={className}>{blocks}</div>
}
