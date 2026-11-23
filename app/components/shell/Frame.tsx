'use client'

import { usePathname } from 'next/navigation'
import { useFeatures } from '../study/client'
import { AcademyProvider } from './academy'
import { AcademyShell } from './Shell'

// Every page inside Lyceo opens in the shell, where the learning environment is on (the redesign environment).
// Elsewhere (production) pages render exactly as before, and the public pages (the landing, the demo, privacy)
// never use it.

const INSIDE = ['/dashboard', '/courses', '/study-plan', '/progress', '/lyceum', '/materials', '/sessions', '/profile']

export const isInside = (path: string) => INSIDE.some((p) => path === p || path.startsWith(`${p}/`))

export function AppFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/'
  return isInside(path) ? <InsideFrame>{children}</InsideFrame> : <>{children}</>
}

function InsideFrame({ children }: { children: React.ReactNode }) {
  const features = useFeatures()
  if (!features) return null
  if (!features.learningLoop) return <>{children}</>
  return (
    <AcademyProvider>
      <AcademyShell>{children}</AcademyShell>
    </AcademyProvider>
  )
}
