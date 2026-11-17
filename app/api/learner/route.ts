import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, requireUser } from '../../lib/server/auth'
import type { LearnerSummary } from '../../lib/lesson'
import { loadLearner } from '../../lib/server/learner'

/** What Lyceo has learned about how this student learns, for the dashboard. */
export async function GET(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const l = await loadLearner(db, user.id)
    const summary: LearnerSummary = {
      answers: l.answers,
      conceptsSeen: l.conceptsSeen,
      firstTryAccuracy: l.firstTryAccuracy,
      recentFirstTryAccuracy: l.recentFirstTryAccuracy,
      avgSecondsToAnswer: l.avgSecondsToAnswer,
      pace: l.pace,
      styleId: l.styleId,
      major: l.major,
      mastered: l.mastered.length,
      needsReview: l.needsReview
        .slice(0, 6)
        .map(({ concept, courseId, courseTitle }) => ({ concept, courseId, courseTitle })),
    }
    return NextResponse.json(summary)
  } catch (err) {
    return errorResponse(err, 'Could not load your learning profile.')
  }
}
