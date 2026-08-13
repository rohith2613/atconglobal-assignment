'use client'

import { useEffect, useRef, useState } from 'react'

let initialised = false
let renderSeq = 0

/**
 * Renders a Mermaid diagram, or shows the source when it will not parse.
 *
 * Two details this got wrong first time round, both of which produced an empty
 * box with no error at all:
 *
 * - The render id was fixed per diagram. React runs effects twice in
 *   development, so the second render collided with the id the first had
 *   already put in the DOM and quietly produced nothing. Every render now gets
 *   a fresh id.
 * - `securityLevel: 'strict'` turns off HTML labels, and the node text uses
 *   `<br/>` to put the actor under the step name. `htmlLabels` is now set
 *   explicitly, and sanitisation is kept.
 *
 * A diagram is built from a client's own step names, which contain quotes and
 * brackets. `toMermaid` escapes the cases we know about; the error branch here
 * handles the ones we do not, because a visible failure with the source beside
 * it is far more useful than a blank rectangle.
 */
export function Mermaid({ chart, id }: { chart: string; id: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default

        if (!initialised) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            htmlLabels: true,
            theme: 'base',
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            themeVariables: {
              background: '#12161d',
              mainBkg: '#1c2733',
              primaryColor: '#1c2733',
              primaryTextColor: '#dbe6f0',
              primaryBorderColor: '#3d5163',
              lineColor: '#5fb3c4',
              secondaryColor: '#191f28',
              tertiaryColor: '#12161d',
              nodeBorder: '#3d5163',
              clusterBkg: '#12161d',
              titleColor: '#dbe6f0',
              edgeLabelBackground: '#12161d',
              fontSize: '13px',
            },
            flowchart: { htmlLabels: true, curve: 'basis', nodeSpacing: 34, rankSpacing: 44, padding: 12 },
          })
          initialised = true
        }

        // A fresh id every time. Reusing one across React's double-invoked
        // effects is what produced the silent empty render.
        renderSeq += 1
        const { svg } = await mermaid.render(`mm-${id}-${renderSeq}`, chart)

        if (live && host.current) {
          host.current.innerHTML = svg
          // Shrink to fit, never stretch. Forcing width:100% scaled a
          // four-node flowchart up until the labels were larger than the page
          // headings — a diagram should sit inside the reading rhythm, not
          // shout over it.
          const el = host.current.querySelector('svg')
          if (el) {
            el.removeAttribute('width')
            el.removeAttribute('height')
            el.style.maxWidth = '100%'
            el.style.height = 'auto'
          }
          setError(null)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'The diagram could not be drawn.')
      }
    })()

    return () => {
      live = false
    }
  }, [chart, id])

  if (error) {
    return (
      <div>
        <p className="ap mb-2 text-[var(--flag-red)]">The diagram could not be drawn — here is its source</p>
        <pre className="id max-h-[300px] overflow-auto whitespace-pre-wrap text-[11px] text-[var(--paper-400)]">
          {chart}
        </pre>
      </div>
    )
  }

  return <div ref={host} className="mermaid-host flex min-h-[120px] w-full justify-center overflow-x-auto" />
}
