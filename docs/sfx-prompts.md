# Pusoy Trese — ElevenLabs Sound Effect Prompts

Copy-paste prompts for the ElevenLabs **Sound Effects** generator, one per file
in the shot list in `voice-lines.md`. Save results to `src/assets/sfx/` with
the exact filenames below.

## How to use the generator

- **Duration:** set it manually to the value given — "auto" tends to run long
  for UI one-shots. Trim silence off the ends after download.
- **Prompt influence:** high (~80–100%) for the foley/UI sounds so it follows
  the description literally; medium (~50%) for the jingles/fanfares so it has
  room to be musical.
- Each generation returns several variations — pick the cleanest, and keep a
  spare take of the frequent sounds (card drop, chip place) if two takes sound
  good; alternating them avoids machine-gun repetition.
- Loudness-match everything afterwards (same −16 LUFS target as the voice
  lines) so no effect jumps out over the music.

## Card foley

| File | Duration | Prompt |
|---|---|---|
| `card_shuffle.mp3` | 1.5s | A single riffle shuffle of a deck of playing cards, crisp and fast, close-mic'd, dry, no room reverb, no background noise, no music. |
| `card_deal.mp3` | 1s | Several playing cards dealt quickly onto a felt casino table in rapid succession, soft snappy flicks, dry, no background noise, no music. |
| `card_pick.mp3` | 0.5s | A single playing card sliding and lifting off a felt table, one short soft swipe, subtle, dry, no background noise, no music. |
| `card_drop.mp3` | 0.5s | A single playing card placed down gently on a felt table, one soft muted tap, very short, dry, no background noise, no music. |
| `card_swap.mp3` | 0.7s | Two playing cards quickly swapping places on a felt table, two fast soft flicks in immediate succession, light and springy, dry, no background noise, no music. |
| `card_flip.mp3` | 0.6s | A playing card flipped over on a felt table, one crisp snap as the card turns and lands, dry, no background noise, no music. |

## Chip foley

| File | Duration | Prompt |
|---|---|---|
| `chip_place.mp3` | 0.5s | A single clay poker chip placed onto a small stack of chips, one solid ceramic click, close-mic'd, dry, no background noise, no music. |
| `chip_stack.mp3` | 1s | A stack of clay poker chips riffled together, rapid clicking cascade of ceramic chips, dry, no background noise, no music. |
| `chip_slide.mp3` | 1.2s | A pile of poker chips pushed sliding across a felt casino table, chips softly clattering together as they move, dry, no background noise, no music. |

## UI

| File | Duration | Prompt |
|---|---|---|
| `button_click.mp3` | 0.3s | A soft modern UI button click, single short rounded tick, subtle and pleasant, dry, no reverb, no background noise, no music. |
| `menu_open.mp3` | 0.4s | A subtle short UI whoosh sweeping upward, soft airy swipe for a menu opening, gentle, dry, no background noise, no music. |
| `menu_close.mp3` | 0.4s | A subtle short UI whoosh sweeping downward, soft airy swipe for a menu closing, gentle, dry, no background noise, no music. |

## Stingers & fanfares

| File | Duration | Prompt |
|---|---|---|
| `foul_buzzer.mp3` | 0.8s | A muted game-show error buzzer, two short low buzzes in quick succession, rounded and soft, noticeable but not harsh or alarming, no music. |
| `win_jingle.mp3` | 1.5s | A short bright casino win jingle, three ascending cheerful marimba and bell notes, warm and satisfying, clean ending, no vocals. |
| `lose_sting.mp3` | 1.2s | A short soft losing sting, two gentle descending muted notes on marimba, sympathetic rather than sad, quiet clean ending, no vocals. |
| `sweep_fanfare.mp3` | 2s | A short triumphant casino jingle, a quick ascending run of bright bells and marimba ending on a sparkling high chord with a light chime shimmer, celebratory, no vocals. |
| `natural_fanfare.mp3` | 3s | A big jackpot fanfare, dramatic cymbal crash into a short triumphant brass and bell flourish with a sparkling shimmer tail, the biggest celebration sound in a casino game, no vocals. |
| `banker_crown.mp3` | 1.2s | A short regal chime, a small majestic bell arpeggio with a hint of brass, announcing royalty in a game, clean ending, no vocals. |
| `match_win_fanfare.mp3` | 4s | A full victory celebration fanfare, triumphant brass melody with bells, a cymbal crash and a confetti-like sparkle finish, grand and joyful, clean ending, no vocals. |
| `match_end.mp3` | 2s | A neutral game-over resolution, a single warm mellow chord on soft piano and strings that gently fades, conclusive but neither happy nor sad, no vocals. |

## Prompting tips if a result comes out wrong

- Too much room echo → append "completely dry, studio recording, no reverb".
- It generated a loop/ambience instead of a one-shot → prepend "One single
  short sound effect:".
- Foley came out musical → make sure "no music" is in the prompt and raise
  prompt influence.
- A jingle sounds generic → name different instruments (kalimba, vibraphone,
  pizzicato strings) or a mood ("playful", "majestic") and regenerate.
- Too long/trailing noise → shorten the duration setting; it forces a tighter
  performance.
