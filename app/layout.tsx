import type { Metadata } from 'next'
import '@fontsource/alegreya-sans/400.css'
import '@fontsource/alegreya-sans/400-italic.css'
import '@fontsource/alegreya-sans/500.css'
import '@fontsource/alegreya-sans/700.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/600.css'
import 'katex/dist/katex.min.css'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lyceo: the tutor that learns how you learn',
  description:
    'Upload your lecture slides or recordings and Lyceo turns them into a narrated whiteboard lesson that checks your understanding and re-explains what you miss.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
