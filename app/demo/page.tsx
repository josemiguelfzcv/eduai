import type { Metadata } from 'next'
import { Logo } from '../components/Logo'
import { LessonPlayer } from '../components/LessonPlayer'
import { SignInButton } from '../components/SignInButton'
import { DEMO_LESSON } from '../lib/demo-lesson'

export const metadata: Metadata = {
  title: "Demo lesson: Bayes' theorem | Lyceo",
  description: "A 5-minute Lyceo lesson on Bayes' theorem. No account needed.",
}

export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-4">
          <Logo />
          <SignInButton className="btn btn-quiet py-2" label="Use my own notes" />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 pb-24 pt-10">
        <LessonPlayer lesson={DEMO_LESSON} demo />
      </main>
    </div>
  )
}
