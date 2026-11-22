// Finishes account deletions whose files couldn't be removed at the time: deletes everything under materials/<user>/
// and incoming/<user>/ for each pending row in private.account_deletions. Safe to run repeatedly.
//
//   LYCEO_SERVER_DATABASE_URL=… LYCEO_MATERIALS_BUCKET=… LYCEO_MATERIALS_R2_ACCESS_KEY_ID=… \
//   LYCEO_MATERIALS_R2_SECRET_ACCESS_KEY=… LYCEO_MATERIALS_R2_ENDPOINT=… npm run cleanup:deletions
import { deleteAllFilesOf, materialStore } from '../app/lib/server/materials'
import { markAccountFilesDeleted, pendingAccountDeletions } from '../app/lib/server/records'
import { closeTrustedDb } from '../app/lib/server/trusted-db'

async function main() {
  if (!materialStore()) throw new Error('Private storage is not configured (LYCEO_MATERIALS_*).')
  const pending = await pendingAccountDeletions(100)
  let done = 0
  for (const userId of pending) {
    try {
      await deleteAllFilesOf(userId)
      await markAccountFilesDeleted(userId)
      done++
    } catch (err) {
      await markAccountFilesDeleted(userId, String((err as Error).message ?? err))
    }
  }
  console.log(`${pending.length} pending, ${done} finished.`)
}

main()
  .catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
  .finally(() => closeTrustedDb())
