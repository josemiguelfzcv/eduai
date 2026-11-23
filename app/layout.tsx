import type { Metadata } from 'next'
import '@fontsource-variable/inter'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource/caveat/500.css'
import '@fontsource/caveat/600.css'
import 'katex/dist/katex.min.css'
import './globals.css'
import { AppFrame } from './components/shell/Frame'

export const metadata: Metadata = {
  title: 'Lyceo: your university, understood',
  description:
    'Personalized, AI-powered learning for college students. Lyceo turns your own course materials into interactive lessons that check what you understood and adapt to what you missed.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  )
}
