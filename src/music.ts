// Background music registry + playback hook. Each track is an mp3 asset;
// `off` silences playback entirely.

import { useEffect } from 'react'
import lofiHiphop from './assets/bg_music/lofi_hiphop.mp3'
import elevatorMusic from './assets/bg_music/elevator_music.mp3'

export interface MusicMeta {
  label: string
  src: string | null
}

export const MUSIC = {
  off: { label: 'Off', src: null },
  lofi: { label: 'LoFi HipHop', src: lofiHiphop },
  elevator: { label: 'Elevator Music', src: elevatorMusic },
} satisfies Record<string, MusicMeta>

export type MusicKey = keyof typeof MUSIC

export const MUSIC_KEYS = Object.keys(MUSIC) as MusicKey[]

// Loops the selected track for as long as the component is mounted. Autoplay
// may be blocked before the first user gesture, so a rejected play() retries
// once on the next pointerdown.
export function useBgMusic(track: MusicKey, volume = 0.35) {
  useEffect(() => {
    const src = MUSIC[track].src
    if (!src) return
    const audio = new Audio(src)
    audio.loop = true
    audio.volume = volume
    let retry: (() => void) | null = null
    audio.play().catch(() => {
      retry = () => {
        audio.play().catch(() => {})
        retry = null
      }
      document.addEventListener('pointerdown', retry, { once: true })
    })
    return () => {
      if (retry) document.removeEventListener('pointerdown', retry)
      audio.pause()
      audio.src = ''
    }
  }, [track, volume])
}
