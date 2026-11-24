import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Logo } from '../components/Logo'
import { learningLoopEnabled } from '../lib/server/learning-data'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Privacy · Lyceo' }

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What Lyceo keeps',
    body: [
      'Your Google sign-in: your name and email address.',
      'What you add: your courses, deadlines and the files you upload, with the text Lyceo reads from them.',
      'What you do: the ideas Lyceo found in your material, the questions it asked, your answers, how each was graded, hints you asked for and the time you spent. Lyceo uses this to decide what you practice next.',
      'What it costs: one record for each AI call, with its price and the session it belonged to.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Only you. Your files sit in a private storage bucket. Each upload link is made for one file and expires after ten minutes, and nobody else can open what you uploaded.',
      'Answer keys stay on Lyceo’s server until you’ve answered, so the app in your browser never has them.',
    ],
  },
  {
    title: 'Services that handle it',
    body: [
      'Supabase stores your account and your study records. Cloudflare R2 stores your files. Vercel runs the app. Google Calendar, if you connect it, holds the Lyceo calendar.',
      'Anthropic’s Claude reads the text of your material, and your answers, to find ideas, write questions and explanations, and grade answers.',
    ],
  },
  {
    title: 'Google Calendar, if you connect it',
    body: [
      'Lyceo asks Google for two things only: to see when you’re busy (the times, never what your events are) and to keep one calendar of its own, called Lyceo, with your open deadlines and the study sessions you choose to add. It can’t see or change any of your other calendars.',
      'It keeps the permission Google gives it, encrypted, with the Google account’s email address. Your busy times are read when you open the Study Plan and are not stored.',
      'Disconnect it from the Study Plan and Lyceo asks Google to cancel the permission and forgets it. The Lyceo calendar stays in your Google account until you delete it there.',
    ],
  },
  {
    title: 'Deleting',
    body: [
      'Delete a material and its file is gone; the ideas it added and your answers stay in the course.',
      'Delete a course and its materials, ideas, Quick Checks and answers go with it.',
      'Delete your account (Profile, at the bottom) and everything above is deleted, and Google Calendar is disconnected. The cost records stay, with nothing that links them to you. Uploads you started but never finished are removed within a day.',
    ],
  },
]

/** The privacy note for the learning loop (staging and pilots). Not shown where the learning loop is off. */
export default function Privacy() {
  if (!learningLoopEnabled()) notFound()
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Logo href="/dashboard" />
      <h1 className="mt-10 text-[clamp(2rem,4vw,2.8rem)]">Your data in Lyceo</h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        What Lyceo keeps while you study, who can see it, and how to delete it.
      </p>
      <div className="mt-10 space-y-10">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-[1.45rem]">{s.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 marker:text-gold-deep">
              {s.body.map((line) => (
                <li key={line} className="max-w-[66ch]">
                  {line}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-12">
        <Link href="/profile" className="text-forest underline underline-offset-4">
          Back to your profile
        </Link>
      </p>
    </main>
  )
}
