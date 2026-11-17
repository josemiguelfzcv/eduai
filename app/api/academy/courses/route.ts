import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../../lib/server/auth'
import { rows, text, toCourse } from '../../../lib/server/academy'

const COLUMNS = 'id, name, code, term, created_at'

/** The student's active courses, for pickers. */
export async function GET(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const data = rows(
      await db
        .from('academy_courses')
        .select(COLUMNS)
        .eq('user_id', user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: true }),
    )
    return NextResponse.json({ courses: data.map(toCourse) })
  } catch (err) {
    return errorResponse(err, 'Could not load your courses.')
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const body = await req.json()
    const data = rows(
      await db
        .from('academy_courses')
        .insert({
          user_id: user.id,
          name: text(body.name, 'Course name', 120, true),
          code: text(body.code, 'Course code', 30),
          term: text(body.term, 'Term', 40),
        })
        .select(COLUMNS)
        .single(),
    )
    return NextResponse.json({ course: toCourse(data) })
  } catch (err) {
    return errorResponse(err, 'Could not create the course.')
  }
}
