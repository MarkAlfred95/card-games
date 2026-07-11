// Sound-effect registry + playback. One-shots from src/assets/sfx/ (prompt
// list: docs/sfx-prompts.md). Effects play on their own channel and may
// overlap each other — they never touch the dealer voice or the music.

// filename (sans extension) -> bundled asset url
const FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob('./assets/sfx/*.mp3', {
      eager: true,
      import: 'default',
    }) as Record<string, string>,
  ).map(([path, url]) => [path.split('/').pop()!.replace(/\.mp3$/, ''), url]),
)

export type SfxKey =
  | 'card_shuffle'
  | 'card_deal'
  | 'card_pick'
  | 'card_drop'
  | 'card_swap'
  | 'card_flip'
  | 'chip_place'
  | 'chip_stack'
  | 'chip_slide'
  | 'button_click'
  | 'menu_open'
  | 'menu_close'
  | 'foul_buzzer'
  | 'win_jingle'
  | 'lose_sting'
  | 'sweep_fanfare'
  | 'natural_fanfare'
  | 'banker_crown'
  | 'match_win_fanfare'
  | 'match_end'

let volume = 0.4

export function setSfxVolume(v: number) {
  volume = v
}

export function playSfx(key: SfxKey) {
  const url = FILES[key]
  if (!url || volume <= 0) return
  const audio = new Audio(url)
  audio.volume = volume
  // Autoplay may be blocked before the first user gesture — drop it silently.
  audio.play().catch(() => {})
}
