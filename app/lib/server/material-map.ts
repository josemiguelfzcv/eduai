import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractText } from 'unpdf'
import { joinPages, mapHeadline, sameName, type VerifiedIdea } from '../skill-map'
import { HttpError } from './auth'
import type { MaterialRow, SkillRow, SourceRow } from './learning-data'
import type { IdeaView, MaterialView } from '../views'

// A material from file to skill map: its text read page by page, and the map written as the student's own rows
// (skills and skill_sources, under row-level security), ready for a yes or no on what Lyceo wasn't sure of.

/** public.materials.text holds at most this much. */
const MAX_TEXT = 400_000
/** Below this much text a PDF is a scan or a picture deck, and there is nothing to map. */
const MIN_TEXT = 200

export async function readPdfPages(bytes: Uint8Array) {
  const { text: pageTexts } = await extractText(bytes, { mergePages: false })
  const kept: string[] = []
  let size = 0
  for (const t of pageTexts) {
    const clean = t.replace(/\u0000/g, '').trim()
    if (size + clean.length + 2 > MAX_TEXT) break
    kept.push(clean)
    size += clean.length + 2
  }
  const total = kept.join(' ').replace(/\s+/g, ' ').trim().length
  if (total < MIN_TEXT)
    throw new HttpError(
      422,
      'This PDF has almost no selectable text, so it’s probably a scan. Export the slides as a PDF from PowerPoint, Keynote or Google Slides and upload that.',
    )
  return { ...joinPages(kept), totalPages: pageTexts.length, keptPages: kept.length }
}

type DbResult<T> = { data: T | null; error: { message: string; code?: string } | null }
function must<T>(r: DbResult<T>): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

/** The student's own material (row-level security already limits it; the user filter says so explicitly). */
export async function getMaterial(db: SupabaseClient, id: number, userId: string) {
  const row = must(
    (await db
      .from('materials')
      .select('id, title, kind, academy_course_id, status, policy, failure, created_at, pages')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()) as DbResult<MaterialRow & { pages: { n: number }[] }>,
  )
  if (!row) throw new HttpError(404, 'That material does not exist.')
  return row
}

/**
 * Writes the verified map. Anything a previous, interrupted attempt left for this material is removed first, so
 * calling it again doesn't duplicate ideas.
 */
export async function writeSkillMap(db: SupabaseClient, material: MaterialRow, ideas: VerifiedIdea[]) {
  if (material.academy_course_id === null) throw new HttpError(409, 'Put this material in a course first.')
  const courseId = material.academy_course_id
  const previous = must(
    (await db.from('skill_sources').select('id, skill_id').eq('material_id', material.id)) as DbResult<
      { id: number; skill_id: number }[]
    >,
  )
  if (previous.length) {
    must(await db.from('skill_sources').delete().eq('material_id', material.id))
    const orphans = must(
      (await db
        .from('skills')
        .select('id, created_at, confirmed_at, skill_sources(id)')
        .in(
          'id',
          previous.map((p) => p.skill_id),
        )) as DbResult<
        { id: number; created_at: string; confirmed_at: string | null; skill_sources: { id: number }[] }[]
      >,
    ).filter((s) => !s.skill_sources.length && !s.confirmed_at && s.created_at >= material.created_at)
    // A skill with answers can't be deleted (row-level security keeps the evidence); it stays.
    if (orphans.length)
      await db
        .from('skills')
        .delete()
        .in(
          'id',
          orphans.map((o) => o.id),
        )
  }

  for (const idea of ideas) {
    let skillId = idea.existingSkillId
    if (skillId === null) {
      const created = await db
        .from('skills')
        .insert({ academy_course_id: courseId, name: idea.name, objective: idea.objective, facets: idea.facets })
        .select('id')
        .single()
      if (created.error?.code === '23505') {
        // Same name as an active skill (written meanwhile): use that one.
        const twin = must(
          (await db
            .from('skills')
            .select('id, name')
            .eq('academy_course_id', courseId)
            .eq('status', 'active')) as DbResult<{ id: number; name: string }[]>,
        ).find((s) => sameName(s.name, idea.name))
        if (!twin) throw new Error(created.error.message)
        skillId = twin.id
      } else skillId = must(created as DbResult<{ id: number }>).id
    }
    const locator: SourceRow['locator'] = { pages: idea.pages }
    if (idea.joined) locator.joined = { name: idea.name, objective: idea.objective, facets: idea.facets }
    must(
      await db.from('skill_sources').insert({
        skill_id: skillId,
        material_id: material.id,
        locator,
        quote: idea.quote,
        origin: idea.origin,
      }),
    )
  }
}

export async function materialView(db: SupabaseClient, materialId: number, userId: string): Promise<MaterialView> {
  const material = await getMaterial(db, materialId, userId)
  const course =
    material.academy_course_id === null
      ? null
      : must(
          (await db
            .from('academy_courses')
            .select('id, name')
            .eq('id', material.academy_course_id)
            .maybeSingle()) as DbResult<{ id: number; name: string }>,
        )
  const sources = must(
    (await db
      .from('skill_sources')
      .select('id, skill_id, material_id, lesson_id, locator, quote, origin')
      .eq('material_id', materialId)
      .order('id')) as DbResult<SourceRow[]>,
  )
  const skillIds = [...new Set(sources.map((s) => s.skill_id))]
  const skills = skillIds.length
    ? must(
        (await db
          .from('skills')
          .select(
            'id, academy_course_id, name, objective, facets, status, merged_into, confirmed_at, created_at, skill_sources(material_id, lesson_id)',
          )
          .in('id', skillIds)) as DbResult<
          (SkillRow & { skill_sources: { material_id: number | null; lesson_id: number | null }[] })[]
        >,
      )
    : []
  const byId = new Map(skills.map((s) => [s.id, s]))
  const ideas: IdeaView[] = sources
    .filter((s) => byId.get(s.skill_id)?.status === 'active')
    .map((s) => {
      const skill = byId.get(s.skill_id)!
      const elsewhere = skill.skill_sources.some((o) => o.material_id !== materialId)
      const joined = s.locator.joined ?? null
      return {
        sourceId: s.id,
        skillId: skill.id,
        name: skill.name,
        objective: skill.objective,
        pages: s.locator.pages ?? [],
        quote: s.quote,
        origin: s.origin,
        already: elsewhere || skill.created_at < material.created_at,
        joined,
        flagged: !!joined || (s.origin === 'inferred' && !skill.confirmed_at),
      }
    })
  const already = ideas.filter((i) => i.already).length
  return {
    material: {
      id: material.id,
      title: material.title,
      kind: material.kind,
      status: material.status,
      policy: material.policy,
      failure: material.failure,
      courseId: material.academy_course_id,
      courseName: course?.name ?? null,
      pageCount: material.pages?.length ?? 0,
      createdAt: material.created_at,
    },
    headline: ideas.length ? mapHeadline(ideas.length, already) : null,
    ideas,
  }
}
