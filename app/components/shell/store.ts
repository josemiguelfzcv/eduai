'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

// Small preferences kept on this device (the sidebar folded, which courses and sections are open). Held in memory too,
// so the controls keep working where storage is blocked. Read as strings so React can compare snapshots cheaply.

const memory = new Map<string, string>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function read(key: string) {
  if (memory.has(key)) return memory.get(key)!
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  memory.set(key, value)
  try {
    window.localStorage.setItem(key, value)
  } catch {}
  listeners.forEach((l) => l())
}

/** One of a few string values, remembered. */
export function usePreference<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const value = stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : initial
  const set = useCallback((next: T) => write(key, next), [key])
  return [value, set] as const
}

/** A remembered set of strings (open courses, open sections). */
export function usePreferenceSet(key: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const value = useMemo(() => {
    try {
      const list = JSON.parse(raw ?? '[]')
      return new Set<string>(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [])
    } catch {
      return new Set<string>()
    }
  }, [raw])
  const update = useCallback(
    (change: (current: Set<string>) => void) => {
      let current: string[] = []
      try {
        current = JSON.parse(read(key) ?? '[]')
      } catch {}
      const next = new Set(Array.isArray(current) ? current : [])
      change(next)
      write(key, JSON.stringify([...next].slice(-60)))
    },
    [key],
  )
  return [value, update] as const
}

/** Whether a media query matches (false while rendering on the server). */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
