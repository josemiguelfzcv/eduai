import { localToday } from './academy'

/** The browser's IANA time zone, so the server counts days the way the student lives them. */
export function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

export const clockQuery = () => `today=${localToday()}&tz=${encodeURIComponent(timeZone())}`
export const clockBody = () => ({ today: localToday(), tz: timeZone() })
