import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Prism — Business Discovery to POC',
  description:
    'Turns scattered client inputs into an evidence-grounded requirement, a better process, and a working POC.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
