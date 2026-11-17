'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { LessonPlayer } from '../../components/LessonPlayer'
import { normalizeLesson, type Lesson } from '../../lib/lesson'
import { supabase } from '../../lib/supabase'

export default function ClassPage() {
  const user = useRequiredUser()
  const params = useParams<{ id: string }>()
  const courseId = Number(params.id)
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'pending'>('loading')

  useEffect(() => {
    if (!user) return
    supabase
      .from('courses')
      .select('script, status')
      .eq('id', courseId)
      .maybeSingle()
      .then(({ data }) => {
        const parsed = normalizeLesson(data?.script)
        if (parsed) {
          setLesson(parsed)
          setState('ready')
        } else {
          setState(data ? 'pending' : 'missing')
        }
      })
  }, [user, courseId])

  return (
    <AppShell>
      {state === 'loading' && <LoadingNote>Opening your lesson</LoadingNote>}
      {state === 'ready' && lesson && <LessonPlayer key={courseId} lesson={lesson} courseId={courseId} />}
      {(state === 'missing' || state === 'pending') && (
        <div className="max-w-xl">
          <h1 className="text-[2rem]">
            {state === 'missing' ? "This lesson doesn't exist" : "This lesson isn't ready"}
          </h1>
          <p className="mt-3 text-ink-soft">
            {state === 'missing'
              ? 'It may have been deleted, or it belongs to another account.'
              : 'Theo never finished writing it. Upload the material again to get a fresh lesson.'}
          </p>
          <Link href={state === 'missing' ? '/dashboard' : '/upload'} className="btn btn-primary mt-6 no-underline">
            {state === 'missing' ? 'Back to my lessons' : 'Upload the material again'}
          </Link>
        </div>
      )}
    </AppShell>
  )
}
