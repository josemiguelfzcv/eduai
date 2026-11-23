import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../../lib/server/auth'
import { lectureId } from '../../../../lib/server/lessons'
import { requireLearningLoop } from '../../../../lib/server/learning-data'

type Context = { params: Promise<{ id: string }> }

/** Clears this lecture's Ask Lyceo conversation. The lesson and its progress stay. */
export async function DELETE(req: NextRequest, context: Context) {
  try {
    const { user, db } = await requireUser(req)
    requireLearningLoop(user)
    const id = lectureId((await context.params).id)
    const { error } = await db.from('lesson_messages').delete().eq('material_id', id).eq('user_id', user.id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err, 'Could not clear the conversation.')
  }
}
