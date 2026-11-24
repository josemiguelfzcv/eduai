import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError, requireUser, signedInWithin } from '../../../lib/server/auth'
import { revoke, tokenToRevoke } from '../../../lib/server/calendar'
import { deleteAllFilesOf } from '../../../lib/server/materials'
import { markAccountFilesDeleted, serverRecordsEnabled } from '../../../lib/server/records'

/** The database refuses too, independently (public.delete_my_account checks the same claim). */
const RECENT_SIGN_IN_SECONDS = 15 * 60
const REAUTH = 'For your security, sign in again, then delete your account within 15 minutes.'

/**
 * Deletes the signed-in student's account. The database part runs as the student (public.delete_my_account, which
 * can only delete auth.uid()); then the server deletes their files, and if that fails it's retried later from
 * private.account_deletions (npm run cleanup:deletions).
 */
export async function POST(req: NextRequest) {
  try {
    const { user, db } = await requireUser(req)
    const { confirm } = await req.json().catch(() => ({}))
    if (confirm !== 'delete my account') throw new HttpError(400, 'Type "delete my account" to confirm.')
    if (!signedInWithin(req, RECENT_SIGN_IN_SECONDS)) {
      return NextResponse.json({ error: REAUTH, reauthenticate: true }, { status: 401 })
    }

    // The calendar connection goes with the account; its token is read first so Google can be told to forget it.
    const googleToken = await tokenToRevoke(user.id)
    const { error } = await db.rpc('delete_my_account')
    if (error?.code === 'LY010') return NextResponse.json({ error: REAUTH, reauthenticate: true }, { status: 401 })
    if (error?.code === 'PGRST202' || error?.code === '42883') {
      throw new HttpError(404, 'Account deletion is not available yet. Nothing was deleted.')
    }
    if (error) throw error

    if (googleToken) await revoke(googleToken)

    let filesPending = false
    try {
      await deleteAllFilesOf(user.id)
      if (serverRecordsEnabled()) await markAccountFilesDeleted(user.id)
    } catch (err) {
      filesPending = true
      console.error('Account deleted; file cleanup will be retried', err)
      if (serverRecordsEnabled())
        await markAccountFilesDeleted(user.id, String((err as Error).message ?? err)).catch(() => {})
    }
    return NextResponse.json({ deleted: true, filesPending })
  } catch (err) {
    return errorResponse(err, 'Could not delete your account. Nothing was deleted.')
  }
}
