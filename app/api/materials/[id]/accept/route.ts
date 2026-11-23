import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { requireLearningLoop } from '../../../../lib/server/learning-data'
import { materialView } from '../../../../lib/server/material-map'

type Context = { params: Promise<{ id: string }> }

/** "Start studying": accepts the material's map as it is, including the ideas still waiting for a yes or no. */
export async function POST(req: NextRequest, context: Context) {
  try {
    requireLearningLoop()
    const { user, db } = await requireUser(req)
    const id = Number((await context.params).id)
    if (!Number.isSafeInteger(id)) throw new HttpError(404, 'That material does not exist.')
    const view = await materialView(db, id, user.id)
    if (view.material.status !== 'mapped') throw new HttpError(409, 'This material has no map yet.')

    const unconfirmed = view.ideas.filter((i) => i.flagged).map((i) => i.skillId)
    if (unconfirmed.length) {
      const r = await db
        .from('skills')
        .update({ confirmed_at: new Date().toISOString() })
        .in('id', unconfirmed)
        .is('confirmed_at', null)
      if (r.error) throw r.error
    }
    for (const idea of view.ideas.filter((i) => i.joined)) {
      const r = await db
        .from('skill_sources')
        .update({ locator: { pages: idea.pages } })
        .eq('id', idea.sourceId)
      if (r.error) throw r.error
    }
    return NextResponse.json({ ...(await materialView(db, id, user.id)), courseId: view.material.courseId })
  } catch (err) {
    return errorResponse(err, 'Could not save the map. Try again.')
  }
}
