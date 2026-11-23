import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { lectureId } from '../../../../lib/server/lessons'
import { requireLearningLoop } from '../../../../lib/server/learning-data'

type Context = { params: Promise<{ id: string }> }
const SECTION = /^[a-z0-9-]{1,40}$/
const BLOCK = /^[a-z0-9-]{1,60}$/

/** Where the student is in the lesson: the section, the sections finished, and the exact reading position. */
export async function PUT(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = lectureId((await context.params).id)
    const body = await req.json()
    const update: Record<string, unknown> = {
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (typeof body.currentSection === 'string' && SECTION.test(body.currentSection))
      update.current_section = body.currentSection
    if (Array.isArray(body.completed))
      update.completed_sections = [
        ...new Set(body.completed.filter((s: unknown) => typeof s === 'string' && SECTION.test(s))),
      ].slice(0, 20)
    const p = body.position
    if (p && SECTION.test(String(p.section)) && BLOCK.test(String(p.block)) && Number.isFinite(Number(p.offset)))
      update.position = { section: p.section, block: p.block, offset: Math.min(1, Math.max(0, Number(p.offset))) }
    const { data, error } = await db
      .from('material_lessons')
      .update(update)
      .eq('material_id', id)
      .eq('user_id', user.id)
      .select('id')
    if (error) throw error
    if (!data?.length) throw new HttpError(404, 'This lecture has no lesson yet.')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not save your place.')
  }
}
