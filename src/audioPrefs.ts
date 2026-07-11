// Audio settings persisted to localStorage (same approach as the wallet):
// background-music track, dealer-voice toggle, and per-channel volumes.
// `useAudioSettings` bundles the whole thing for a game page.

import { useEffect, useState } from 'react'
import { MUSIC, MUSIC_KEYS, useBgMusic } from './music'
import type { MusicKey } from './music'
import { setVoiceEnabled, setVoiceVolume } from './voice'
import type { VoiceKey } from './voice'
import { setSfxVolume } from './sfx'

// Per-channel levels (0..1).
export interface AudioLevels {
  music: number
  voice: number
  sfx: number
}

export interface AudioPrefs {
  music: MusicKey
  voice: VoiceKey
  volumes: AudioLevels
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

// All the audio plumbing a game page needs: settings state initialized from
// localStorage and persisted on change, playback modules kept in sync, and
// background music playing while the page is mounted. The return shape
// matches the Header's audio props, so pages can spread it straight in:
// `<Header {...audio} ... />`.
export function useAudioSettings() {
  const [music, setMusic] = useState<MusicKey>(() => loadAudioPrefs().music)
  const [voice, setVoice] = useState<VoiceKey>(() => loadAudioPrefs().voice)
  const [volumes, setVolumes] = useState<AudioLevels>(
    () => loadAudioPrefs().volumes,
  )

  useBgMusic(music, volumes.music)
  useEffect(() => setVoiceEnabled(voice === 'on'), [voice])
  useEffect(() => setVoiceVolume(volumes.voice), [volumes.voice])
  useEffect(() => setSfxVolume(volumes.sfx), [volumes.sfx])
  useEffect(
    () => saveAudioPrefs({ music, voice, volumes }),
    [music, voice, volumes],
  )

  const musicOptions = MUSIC_KEYS.map(
    (k) => [k, MUSIC[k].label] as [MusicKey, string],
  )
  const onVolume = (channel: keyof AudioLevels, value: number) =>
    setVolumes((prev) => ({ ...prev, [channel]: value }))

  return { music, setMusic, musicOptions, voice, setVoice, volumes, onVolume }
}
