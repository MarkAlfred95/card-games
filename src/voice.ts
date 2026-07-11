// Dealer voice-line registry + playback. Cues map to the mp3s in
// src/assets/voice_lines/ (script: docs/voice-lines.md). A cue with several
// variants plays one at random so frequent events don't grate. Playback is a
// single channel: speak() interrupts whatever is playing, speakAfter() queues
// behind it.

// filename (sans extension) -> bundled asset url
const FILES = Object.fromEntries(
  Object.entries(
    import.meta.glob('./assets/voice_lines/*.mp3', {
      eager: true,
      import: 'default',
    }) as Record<string, string>,
  ).map(([path, url]) => [path.split('/').pop()!.replace(/\.mp3$/, ''), url]),
)

export const VOICE_CUES = {
  welcome: ['welcome'],
  matchStart: ['match_start_a', 'match_start_b'],
  // next_game reads as a dealing line ("On to the next one"), so it joins the
  // round-start pool.
  dealing: ['dealing_a', 'dealing_b', 'next_game'],
  halfway: ['halfway'],
  finalGame: ['final_game'],
  youAreBanker: ['you_are_banker'],
  bankerRotates: ['banker_rotates'],
  bankerWarning: ['banker_warning'],
  placeYourBet: ['place_your_bet_a', 'place_your_bet_b'],
  betPlaced: ['bet_placed_a', 'bet_placed_b'],
  bigBet: ['big_bet'],
  comebackStake: ['comeback_stake'],
  arrangeStart: ['arrange_start'],
  foulWarning: ['foul_warning_a', 'foul_warning_b'],
  arrangementReady: ['arrangement_ready_a', 'arrangement_ready_b'],
  scoring: ['scoring'],
  roundWin: ['round_win_a', 'round_win_b', 'round_win_c'],
  roundWinBig: ['round_win_big'],
  roundLoss: ['round_loss_a', 'round_loss_b', 'round_loss_c'],
  roundLossBig: ['round_loss_big'],
  roundPush: ['round_push'],
  sweep: ['sweep'],
  swept: ['swept'],
  foulSelf: ['foul_self'],
  foulOpponent: ['foul_opponent'],
  royaltyQuads: ['royalty_quads'],
  royaltyStraightFlush: ['royalty_straight_flush'],
  royaltyRoyalFlush: ['royalty_royal_flush'],
  royaltyMiddleFullHouse: ['royalty_middle_full_house'],
  royaltyMiddleTrips: ['royalty_middle_trips'],
  royaltyFrontTrips: ['royalty_front_trips'],
  naturalPureDragon: ['natural_pure_dragon'],
  naturalDragon: ['natural_dragon'],
  naturalThreeFlushes: ['natural_three_flushes'],
  naturalThreeStraights: ['natural_three_straights'],
  naturalSixPairs: ['natural_six_pairs'],
  naturalNoFace: ['natural_no_face'],
  naturalAllRed: ['natural_all_red'],
  naturalAllBlack: ['natural_all_black'],
  naturalOpponent: ['natural_opponent'],
  matchWin: ['match_win'],
  matchMid: ['match_mid'],
  matchLoss: ['match_loss'],
  matchProfit: ['match_profit'],
  playAgain: ['play_again'],
  broke: ['broke'],
  walletReset: ['wallet_reset'],
  divisionUp: ['division_up'],
} satisfies Record<string, string[]>

export type VoiceCue = keyof typeof VOICE_CUES

// Natural key (src/game/naturals.ts) -> its announcement cue.
export const NATURAL_CUES: Record<string, VoiceCue> = {
  'pure-dragon': 'naturalPureDragon',
  dragon: 'naturalDragon',
  'three-flushes': 'naturalThreeFlushes',
  'three-straights': 'naturalThreeStraights',
  'six-pairs': 'naturalSixPairs',
  'no-face-cards': 'naturalNoFace',
  'all-red': 'naturalAllRed',
  'all-black': 'naturalAllBlack',
}

export type VoiceKey = 'on' | 'off'

let enabled = true
let current: HTMLAudioElement | null = null
let queue: string[] = []

export function setVoiceEnabled(on: boolean) {
  enabled = on
  if (!on) stopVoice()
}

export function stopVoice() {
  queue = []
  if (current) {
    current.onended = null
    current.pause()
    current.src = ''
    current = null
  }
}

function playNext() {
  const url = queue.shift()
  if (!url) {
    current = null
    return
  }
  const audio = new Audio(url)
  audio.volume = 0.9
  audio.onended = playNext
  current = audio
  // Autoplay may be blocked before the first user gesture — skip ahead.
  audio.play().catch(() => playNext())
}

// Falsy cues are skipped so call sites can pass conditionals inline.
type CueArg = VoiceCue | null | undefined | false

function resolve(cues: CueArg[]): string[] {
  return cues
    .filter((c): c is VoiceCue => Boolean(c))
    .map((c) => {
      const variants = VOICE_CUES[c].filter((v) => FILES[v])
      return variants.length
        ? FILES[variants[Math.floor(Math.random() * variants.length)]]
        : undefined
    })
    .filter((u): u is string => Boolean(u))
}

// Interrupt whatever is playing and speak these cues in order.
export function speak(...cues: CueArg[]) {
  if (!enabled) return
  const urls = resolve(cues)
  if (!urls.length) return
  stopVoice()
  queue = urls
  playNext()
}

// Queue cues behind the current line instead of cutting it off.
export function speakAfter(...cues: CueArg[]) {
  if (!enabled) return
  const urls = resolve(cues)
  if (!urls.length) return
  queue.push(...urls)
  if (!current) playNext()
}
