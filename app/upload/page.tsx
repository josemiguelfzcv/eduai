'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { generateReactHelpers } from '@uploadthing/react'
import type { OurFileRouter } from '../api/uploadthing/route'
import { AppShell, useRequiredUser } from '../components/AppShell'
import type { AcademyCourse } from '../lib/academy'
import { getJSON, postJSON, supabase } from '../lib/supabase'

const { useUploadThing } = generateReactHelpers<OurFileRouter>()

type Step = 'idle' | 'upload' | 'read' | 'write' | 'done'
const ORDER: Step[] = ['upload', 'read', 'write', 'done']

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

export default function Upload() {
  useRequiredUser()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // null while loading; empty when the student has no courses (or My Academy isn't set up yet)
  const [courses, setCourses] = useState<AcademyCourse[] | null>(null)
  const [courseId, setCourseId] = useState('')

  useEffect(() => {
    getJSON<{ courses: AcademyCourse[] }>('/api/academy/courses')
      .then(({ courses: list }) => {
        setCourses(list)
        const wanted = new URLSearchParams(window.location.search).get('course')
        if (wanted && list.some((c) => String(c.id) === wanted)) setCourseId(wanted)
      })
      .catch(() => setCourses([]))
  }, [])

  const { startUpload } = useUploadThing('materialUploader', {
    headers: async (): Promise<Record<string, string>> => {
      const { data } = await supabase.auth.getSession()
      return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
    },
    onUploadProgress: setProgress,
  })

  const choose = (f: File | undefined) => {
    if (!f) return
    setError(null)
    const ok = isPdf(f) || f.type.startsWith('audio/')
    if (!ok) return setError('Lyceo reads PDFs and audio recordings. Export your slides as a PDF and try again.')
    if (f.size > 32 * 1024 * 1024) return setError('That file is over 32 MB. Try a smaller PDF or a shorter recording.')
    if (!isPdf(f) && f.size > 25 * 1024 * 1024)
      return setError('Recordings must be under 25 MB. Trim it or export it at a lower bitrate.')
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '))
  }

  const run = async () => {
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      setStep('upload')
      const uploaded = await startUpload([file])
      const fileUrl = uploaded?.[0]?.ufsUrl
      if (!fileUrl) throw new Error('The upload did not finish. Check your connection and try again.')

      setStep('read')
      const { courseId: lessonId, text } = await postJSON<{ courseId: number; text: string }>(
        isPdf(file) ? '/api/extract-pdf' : '/api/transcribe',
        { fileUrl, fileName: file.name, title: title.trim(), academyCourseId: courseId ? Number(courseId) : undefined },
      )

      setStep('write')
      await postJSON('/api/synthesize', { courseId: lessonId, text })

      setStep('done')
      router.push(`/class/${lessonId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      setStep('idle')
    }
  }

  const busy = step !== 'idle'
  const audio = file ? !isPdf(file) : false
  const steps: { id: Step; label: string; note?: string }[] = [
    { id: 'upload', label: 'Uploading', note: step === 'upload' ? `${Math.round(progress)}%` : undefined },
    { id: 'read', label: audio ? 'Transcribing the recording' : 'Reading the slides' },
    {
      id: 'write',
      label: 'Theo is writing your lesson',
      note: step === 'write' ? 'usually 30 to 60 seconds' : undefined,
    },
    { id: 'done', label: 'Opening your lesson' },
  ]

  return (
    <AppShell>
      <h1 className="text-[clamp(1.9rem,3.6vw,2.6rem)]">New lesson</h1>
      <p className="mt-3 max-w-[60ch] text-ink-soft">
        Upload the slides or a recording from one class. Theo writes a lesson from it, tailored to how you learn.
      </p>

      <div className="mt-8 max-w-2xl space-y-6">
        {courses && courses.length > 0 ? (
          <div>
            <label htmlFor="course" className="mb-2 block font-bold">
              Course
            </label>
            <select
              id="course"
              className="field"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={busy}
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          courses && (
            <p className="text-[0.92rem] text-ink-soft">
              Tip: add your courses in{' '}
              <Link href="/dashboard" className="text-forest underline underline-offset-4">
                My Academy
              </Link>{' '}
              to group lessons and plan around exams.
            </p>
          )
        )}

        <div>
          <label htmlFor="title" className="mb-2 block font-bold">
            Lesson title
          </label>
          <input
            id="title"
            className="field"
            placeholder="Conditional probability"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            if (!busy) choose(e.dataTransfer.files[0])
          }}
          className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold ${
            dragging ? 'border-forest bg-forest/5' : 'border-line bg-[#fffdf8]'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf,audio/*"
            className="sr-only"
            id="file"
            onChange={(e) => choose(e.target.files?.[0])}
            disabled={busy}
          />
          {file ? (
            <>
              <p className="font-display text-[1.25rem] font-semibold">{file.name}</p>
              <p className="mt-1 text-ink-soft">
                {audio ? 'Recording' : 'PDF'}, {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
              {!busy && (
                <button
                  className="mt-3 text-forest underline underline-offset-4"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose a different file
                </button>
              )}
            </>
          ) : (
            <>
              <p className="font-display text-[1.25rem] font-semibold">Drop a PDF or a recording here</p>
              <p className="mt-1 text-ink-soft">Slides as PDF, or audio up to 25 MB</p>
              <label htmlFor="file" className="btn btn-quiet mt-5 cursor-pointer">
                Choose a file
              </label>
            </>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg border-l-4 border-terracotta bg-terracotta/5 px-4 py-3">
            {error}
          </p>
        )}

        {busy ? (
          <ol className="panel space-y-3 p-6" aria-live="polite">
            {steps.map((s) => {
              const pos = ORDER.indexOf(s.id)
              const current = ORDER.indexOf(step)
              const state = pos < current ? 'done' : pos === current ? 'active' : 'todo'
              return (
                <li key={s.id} className="flex items-center gap-3">
                  {state === 'active' ? (
                    <span className="spinner text-forest" />
                  ) : (
                    <span
                      className={`flex h-[1.1rem] w-[1.1rem] items-center justify-center rounded-full text-[0.7rem] font-bold ${
                        state === 'done' ? 'bg-moss text-white' : 'border-2 border-line'
                      }`}
                      aria-hidden="true"
                    >
                      {state === 'done' ? '✓' : ''}
                    </span>
                  )}
                  <span className={state === 'todo' ? 'text-ink-soft' : 'text-ink'}>{s.label}</span>
                  {s.note && <span className="text-ink-soft">{s.note}</span>}
                </li>
              )
            })}
          </ol>
        ) : (
          <button className="btn btn-primary px-6 py-3" onClick={run} disabled={!file}>
            Make my lesson
          </button>
        )}
      </div>
    </AppShell>
  )
}
