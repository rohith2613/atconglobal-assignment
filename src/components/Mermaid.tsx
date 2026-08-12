'use client'

import { useEffect, useRef, useState } from 'react'

let initialised = false

/**
 * Renders a Mermaid diagram, or shows the source when it will not parse.
 *
 * A diagram is generated from a client's own step names, and those contain
 * quotes, brackets and slashes that Mermaid chokes on. The escaping in
 * toMermaid handles the cases we know about; this handles the ones we do not,
 * because a visible error with the source next to it is far more useful than a
 * blank rectangle.
 */
export function Mermaid({ chart, id }: { chart: string; id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const mermaid = (await import('mermaid')).default

      if (!initialised) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
          themeVariables: {
            background: '#12161d',
            primaryColor: '#1c2733',
            primaryTextColor: '#dbe6f0',
            primaryBorderColor: '#3d5163',
            lineColor: '#5fb3c4',
            secondaryColor: '#191f28',
            tertiaryColor: '#12161d',
            fontSize: '13px',
          },
          flowchart: { curve: 'basis', nodeSpacing: 34, rankSpacing: 42, padding: 10 },
        })
        initialised = true
      }

      try {
        const { svg } = await mermaid.render(`m-${id}`, chart)
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'The diagram could not be drawn.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (error) {
    return (
      <div className="panel p-4">
        <p className="ap mb-2 text-[var(--flag-red)]">The diagram could not be drawn</p>
        <pre className="id max-h-[300px] overflow-auto whitespace-pre-wrap text-[11px] text-[var(--paper-400)]">
          {chart}
        </pre>
      </div>
    )
  }

  return <div ref={ref} className="mermaid-host flex justify-center overflow-x-auto [&_svg]:max-w-full" />
}
