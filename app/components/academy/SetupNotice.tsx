/** Shown until the My Academy migration has been run in Supabase. */
export function SetupNotice() {
  return (
    <div role="alert" className="panel border-gold/60 p-6">
      <h2 className="text-[1.4rem]">My Academy needs a one-time setup</h2>
      <p className="mt-2 max-w-[60ch] text-ink-soft">The database needs the new tables for courses and deadlines.</p>
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-[0.95rem] text-ink-soft">
        <li>Open your Supabase project and go to SQL Editor.</li>
        <li>
          Paste the contents of{' '}
          <code className="rounded bg-ivory-deep px-1.5 py-0.5">supabase/0001_my_academy.sql</code> and click Run.
        </li>
        <li>Reload this page.</li>
      </ol>
    </div>
  )
}
