'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppShell, LoadingNote, useRequiredUser } from '../../components/AppShell'
import { startQuickCheck } from '../../components/study/client'
import { MaterialMapView } from '../../components/study/MaterialMapView'
import type { IdeaView, MaterialView } from '../../lib/views'
import { deleteJSON, getJSON, postJSON } from '../../lib/supabase'

/** A material's skill map: every idea with its page, and a yes or no only for what Lyceo wasn't sure of. */
export default function MaterialMap() {
  const user = useRequiredUser()
  const router = useRouter()
  const id = Number(useParams<{ id: string }>().id)
  const [view, setView] = useState<MaterialView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mapping = useRef(false)

  const show = useCallback(async (next: MaterialView) => {
    setView(next)
    setError(null)
    // Text read but no map yet (an earlier attempt was interrupted): write it now.
    if (next.material.status === 'extracted' && !mapping.current) {
      mapping.current = true
      try {
        setView(await postJSON<MaterialView>(`/api/materials/${next.material.id}/map`, {}))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not find the ideas.')
      } finally {
        mapping.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (user) getJSON<MaterialView>(`/api/materials/${id}`).then(show, (e) => setError(e.message))
  }, [user, id, show])

  const decide = async (idea: IdeaView, keep: boolean) => {
    setBusy(`idea-${idea.sourceId}`)
    try {
      setView(await postJSON<MaterialView>(`/api/materials/${id}/decide`, { sourceId: idea.sourceId, keep }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.')
    } finally {
      setBusy(null)
    }
  }

  const study = async () => {
    if (!view?.material.courseId) return
    setBusy('study')
    setError(null)
    try {
      await postJSON(`/api/materials/${id}/accept`, {})
      const sessionId = await startQuickCheck({ courseId: view.material.courseId, materialId: id })
      router.push(`/sessions/${sessionId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the Quick Check.')
      setBusy(null)
    }
  }

  // The main way to study a material: its written lesson, in the course's learning environment.
  const lesson = async () => {
    if (!view?.material.courseId) return
    setBusy('lesson')
    setError(null)
    try {
      await postJSON(`/api/materials/${id}/accept`, {})
      router.push(`/courses/${view.material.courseId}/lectures/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the lesson.')
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('delete')
    try {
      await deleteJSON(`/api/materials/${id}`)
      router.push(view?.material.courseId ? `/courses/${view.material.courseId}` : '/dashboard')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete it.')
      setBusy(null)
    }
  }

  if (!view) {
    return (
      <AppShell>
        {error ? (
          <div role="alert" className="panel p-6">
            <p>{error}</p>
            <Link href="/dashboard" className="btn btn-quiet mt-4 no-underline">
              Back to My Academy
            </Link>
          </div>
        ) : (
          <LoadingNote>Opening the material</LoadingNote>
        )}
      </AppShell>
    )
  }

  return (
    <AppShell>
      <MaterialMapView
        view={view}
        error={error}
        busy={busy}
        confirmDelete={confirmDelete}
        onRetry={() => getJSON<MaterialView>(`/api/materials/${id}`).then(show, (e) => setError(e.message))}
        onDecide={decide}
        onStudy={study}
        onLesson={view.material.courseId ? lesson : undefined}
        onAskDelete={setConfirmDelete}
        onDelete={remove}
      />
    </AppShell>
  )
}
