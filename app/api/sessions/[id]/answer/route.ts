import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser } from '../../../../lib/server/auth'
import { gradeAttempt, GRADER_VERSION, type Graded } from '../../../../lib/server/grading'
import { loadSession, requireLearningLoop } from '../../../../lib/server/learning-data'
import { itemForGrading, recordAttempt, type PublicItem } from '../../../../lib/server/records'
import { clientClock, sessionId, sessionView } from '../../../../lib/server/sessions'

export const maxDuration = 60

type Context = { params: Promise<{ id: string }> }

const CLARIFY: Record<string, string> = {
  hedged: 'You gave more than one answer. Pick the one you’d go with.',
  multiple_answers: 'You gave more than one answer. Pick the one you’d go with.',
  off_topic: 'That answers a different question. Read it again and answer what it asks.',
  instructions: 'Lyceo grades only the answer itself. Answer the question in your own words.',
}

/**
 * Grades one answer and records it. Whether it was independent is decided by the database from what happened in the
 * session (hints shown, explanations given), not from anything the browser sends. An answer the grader can't read as
 * one answer isn't counted: the student is asked to clarify it, once.
 */
export async function POST(req: NextRequest, context: Context) {
  try {
    requireLearningLoop()
    const { user, db } = await requireUser(req)
    const id = sessionId((await context.params).id)
    const body = await req.json()
    const itemId = String(body.itemId ?? '')
    const dontKnow = body.dontKnow === true
    const answer = dontKnow ? 'I don’t know yet.' : String(body.answer ?? '').trim()
    if (!answer) throw new HttpError(400, 'Write an answer, or choose “I don’t know yet”.')

    const session = await loadSession(db, id)
    if (session.status !== 'active') throw new HttpError(409, 'That session has already ended.')
    const item = session.items.find((i) => i.id === itemId && i.type === 'question')
    if (!item) throw new HttpError(404, 'That question is not in this session.')
    const k = await itemForGrading(user.id, id, itemId)
    if (k.answered) throw new HttpError(409, 'That question was already answered.')

    const round = (item.round ?? 0) as 0 | 1 | 2
    const explained = session.items.some((i) => i.type === 'explanation' && i.skill_id === k.skillId)
    const couldCount = k.hintsRevealed === 0 && !explained && round === 0
    let followsEventId: number | null = null
    if (item.follows) {
      const { data } = await db
        .from('session_events')
        .select('id')
        .eq('study_session_id', id)
        .eq('item_id', item.follows)
        .order('id', { ascending: false })
        .limit(1)
      followsEventId = data?.[0]?.id ?? null
    }

    const graded: Graded = dontKnow
      ? {
          verdict: 'incorrect',
          rubricMet: null,
          rubricTotal: null,
          errorTag: null,
          feedback: 'That’s fine. Here’s how it works.',
          grader: 'rule',
          graderVersion: `${GRADER_VERSION}/rules`,
          doubleGraded: null,
          needsReview: false,
          confidence: null,
          ambiguity: 'blank',
        }
      : await gradeAttempt({
          item: k.public as unknown as PublicItem,
          key: k.key,
          answer,
          userId: user.id,
          studySessionId: id,
          // An answer that could count toward confirming a skill is graded twice when a model grades it.
          confirming: couldCount,
        })

    const seconds = (v: unknown, max: number) => {
      const n = Math.round(Number(v))
      return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : null
    }
    await recordAttempt(user.id, id, itemId, {
      answer,
      verdict: graded.verdict,
      source: round ? 'practice' : 'quick_check',
      hintsUsed: k.hintsRevealed,
      explainedBefore: explained,
      teachingRound: round,
      followsEventId,
      rubricMet: graded.rubricMet,
      rubricTotal: graded.rubricTotal,
      grader: graded.grader,
      graderVersion: graded.graderVersion,
      doubleGraded: graded.doubleGraded,
      needsReview: graded.needsReview,
      gradeConfidence: graded.confidence,
      errorTag: graded.errorTag,
      timeToAnswerSeconds: seconds(body.secondsOnQuestion, 36_000),
      activeSeconds: seconds(body.activeSeconds, 86_400),
    })

    const clarify =
      graded.verdict === 'unclear' && k.unclearAnswers === 0
        ? (CLARIFY[graded.ambiguity] ?? 'Lyceo couldn’t read that as one answer. Try again in your own words.')
        : null
    return NextResponse.json({
      verdict: graded.verdict,
      feedback: graded.verdict === 'unclear' ? null : graded.feedback,
      uncertain: graded.needsReview,
      clarify,
      view: await sessionView(db, user.id, id, clientClock(body)),
    })
  } catch (err) {
    return errorResponse(err, 'Could not check that answer. Try again.')
  }
}
