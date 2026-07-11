// Audio settings persisted to localStorage (same approach as the wallet):
// background-music track, dealer-voice toggle, and per-channel volumes.

import { MUSIC } from './music'
import type { MusicKey } from './music'
import type { VoiceKey } from './voice'

export interface AudioPrefs {
  music: MusicKey
  voice: VoiceKey
  volumes: { music: number; voice: number; sfx: number }
}

const KEY = 'card-hub-audio'

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  music: 'elevator',
  voice: 'on',
  volumes: { music: 0.35, voice: 0.8, sfx: 0.4 },
}

function volumeOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(1, Math.max(0, v))
    : fallback
}

// Stored values are validated field-by-field so a stale or hand-edited entry
// falls back to defaults instead of breaking playback.
export function loadAudioPrefs(): AudioPrefs {
  const d = DEFAULT_AUDIO_PREFS
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return d
    const p = JSON.parse(raw) as Partial<AudioPrefs>
    return {
      music:
        typeof p.music === 'string' && p.music in MUSIC
          ? (p.music as MusicKey)
          : d.music,
      voice: p.voice === 'off' ? 'off' : 'on',
      volumes: {
        music: volumeOr(p.volumes?.music, d.volumes.music),
        voice: volumeOr(p.volumes?.voice, d.volumes.voice),
        sfx: volumeOr(p.volumes?.sfx, d.volumes.sfx),
      },
    }
  } catch {
    return d
  }
}

export function saveAudioPrefs(prefs: AudioPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable (private mode, quota) — settings just won't persist.
  }
}
