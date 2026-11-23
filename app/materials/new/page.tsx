'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AppShell, useRequiredUser } from '../../components/AppShell'
import type { AcademyCourse } from '../../lib/academy'
import { getJSON, postJSON } from '../../lib/supabase'

type Step = 'idle' | 'upload' | 'read' | 'map'
const MAX_BYTES = 32 * 1024 * 1024
const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

type Started = { materialId: number; upload: { url: string; method: 'PUT'; headers: Record<string, string> } }

/** Sends the file straight to the private bucket, reporting progress. */
function put(upload: Started['upload'], file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(upload.method, upload.url)
    for (const [k, v] of Object.entries(upload.headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error('The upload was refused. Try again in a minute.'))
    xhr.onerror = () => reject(new Error('The upload didn’t finish. Check your connection and try again.'))
    xhr.send(file)
  })
}

/** Add material: one class's slides or notes as a PDF, uploaded privately, read page by page and mapped into ideas. */
export default function AddMaterial() {
  useRequiredUser()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [courses, setCourses] = useState<AcademyCourse[] | null>(null)
  const [courseId, setCourseId] = useState('')
  const [newCourse, setNewCourse] = useState('')
  const [title, setTitle] = useState('')
  const [graded, setGraded] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Kept across retries, so a failed step resumes instead of uploading again.
  const [materialId, setMaterialId] = useState<number | null>(null)
  const [uploaded, setUploaded] = useState(false)

  useEffect(() => {
    getJSON<{ courses: AcademyCourse[] }>('/api/academy/courses')
      .then(({ courses: list }) => {
        setCourses(list)
        const wanted = new URLSearchParams(window.location.search).get('course')
        if (wanted && list.some((c) => String(c.id) === wanted)) setCourseId(wanted)
        else if (list.length === 1) setCourseId(String(list[0].id))
      })
      .catch(() => setCourses([]))
  }, [])

  const choose = (f: File | undefined) => {
    if (!f) return
    setError(null)
    if (!isPdf(f)) return setError('Lyceo reads PDFs here. Export your slides or notes as a PDF and try again.')
    if (f.size > MAX_BYTES) return setError('That PDF is over 32 MB. Try exporting it without images.')
    setFile(f)
    setMaterialId(null)
    setUploaded(false)
    if (!title) setTitle(f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '))
  }

  const noCourses = courses !== null && courses.length === 0
  const ready = !!file && !!title.trim() && (noCourses ? !!newCourse.trim() : !!courseId)

  const run = async () => {
    if (!file || !ready) return
    setError(null)
    try {
      let id = materialId
      if (!id) {
        let course = Number(courseId)
        if (noCourses) {
          const created = await postJSON<{ course: AcademyCourse }>('/api/academy/courses', { name: newCourse.trim() })
          course = created.course.id
          setCourses([created.course])
          setCourseId(String(course))
        }
        setStep('upload')
        setProgress(0)
        const started = await postJSON<Started>('/api/materials', {
          title: title.trim(),
          contentType: 'application/pdf',
          bytes: file.size,
          academyCourseId: course,
          policy: graded ? 'graded' : 'study',
        })
        id = started.materialId
        setMaterialId(id)
        await put(started.upload, file, setProgress)
      }
      if (!uploaded) {
        setStep('read')
        await postJSON(`/api/materials/${id}/complete`, {})
        setUploaded(true)
      }
      setStep('map')
      await postJSON(`/api/materials/${id}/map`, {})
      router.push(`/materials/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      setStep('idle')
    }
  }

  const busy = step !== 'idle'
  const steps: { id: Step; label: string; note?: string }[] = [
    { id: 'upload', label: 'Uploading privately', note: step === 'upload' ? `${Math.round(progress)}%` : undefined },
    { id: 'read', label: 'Reading each page' },
    { id: 'map', label: 'Finding the ideas', note: step === 'map' ? 'usually 15 to 30 seconds' : undefined },
  ]
  const order: Step[] = ['upload', 'read', 'map']

  return (
    <AppShell>
      <h1 className="text-[clamp(1.9rem,3.6vw,2.6rem)]">Add material</h1>
      <p className="mt-3 max-w-[60ch] text-ink-soft">
        Upload the slides or notes from one class as a PDF. Lyceo finds the ideas in it, shows you where each one is,
        and checks what you can already do.
      </p>

      <div className="mt-8 max-w-2xl space-y-6">
        {noCourses ? (
          <div>
            <label htmlFor="new-course" className="mb-2 block font-bold">
              Course
            </label>
            <input
              id="new-course"
              className="field"
              placeholder="Statistics 201"
              value={newCourse}
              onChange={(e) => setNewCourse(e.target.value)}
              disabled={busy}
            />
            <p className="mt-1.5 text-[0.88rem] text-ink-soft">Lyceo creates the course with this name.</p>
          </div>
        ) : (
          <div>
            <label htmlFor="course" className="mb-2 block font-bold">
              Course
            </label>
            <select
              id="course"
              className="field"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={busy || courses === null}
            >
              <option value="">{courses === null ? 'Loading your courses…' : 'Choose a course'}</option>
              {(courses ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="title" className="mb-2 block font-bold">
            Title
          </label>
          <input
            id="title"
            className="field"
            placeholder="Lecture 14: Bayes’ rule"
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
            accept=".pdf,application/pdf"
            className="sr-only"
            id="file"
            onChange={(e) => choose(e.target.files?.[0])}
            disabled={busy}
          />
          {file ? (
            <>
              <p className="font-display text-[1.25rem] font-semibold">{file.name}</p>
              <p className="mt-1 text-ink-soft">PDF, {(file.size / 1024 / 1024).toFixed(1)} MB</p>
              {!busy && (
                <button
                  type="button"
                  className="mt-3 text-forest underline underline-offset-4"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose a different file
                </button>
              )}
            </>
          ) : (
            <>
              <p className="font-display text-[1.25rem] font-semibold">Drop a PDF here</p>
              <p className="mt-1 text-ink-soft">Slides or notes, up to 32 MB</p>
              <label htmlFor="file" className="btn btn-quiet mt-5 cursor-pointer">
                Choose a PDF
              </label>
            </>
          )}
        </div>

        <label className="flex items-start gap-3 text-[0.95rem]">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-forest"
            checked={graded}
            onChange={(e) => setGraded(e.target.checked)}
            disabled={busy}
          />
          <span>
            This is a graded assignment
            <span className="block text-[0.88rem] text-ink-soft">
              Lyceo will practice its ideas with problems of its own and never solve the assignment’s.
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" className="rounded-xl border border-terracotta/40 bg-terracotta/5 px-4 py-3 text-terracotta">
            {error}
          </p>
        )}

        {busy ? (
          <ol className="panel space-y-3 p-5" aria-live="polite">
            {steps.map((s) => {
              const state = order.indexOf(s.id) < order.indexOf(step) ? 'done' : s.id === step ? 'now' : 'later'
              return (
                <li key={s.id} className={`flex items-center gap-3 ${state === 'later' ? 'text-ink-soft/70' : ''}`}>
                  {state === 'now' ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true" className="inline-block w-4 text-center text-moss">
                      {state === 'done' ? '✓' : '·'}
                    </span>
                  )}
                  <span className={state === 'now' ? 'font-bold' : ''}>{s.label}</span>
                  {s.note && <span className="text-[0.88rem] text-ink-soft">{s.note}</span>}
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" className="btn btn-primary" onClick={run} disabled={!ready}>
              {materialId ? 'Try again' : 'Upload and read'}
            </button>
            <Link href="/dashboard" className="text-ink-soft underline underline-offset-4">
              Cancel
            </Link>
          </div>
        )}
        <p className="text-[0.85rem] text-ink-soft">
          Your file is stored privately. Only you can open it, and deleting it removes it for good.
        </p>
      </div>
    </AppShell>
  )
}
