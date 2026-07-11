# Pusoy Trese — Voice Line & SFX Script

Recording script for the dealer/announcer voice and the sound-effect shot list.
Every cue is tied to a real game event in `src/pages/PusoyTrese.tsx` /
`src/game/`, so nothing here is speculative — if it's listed, the game can
trigger it.

## Recording guidelines

- **Persona:** a warm, slightly cheeky casino dealer. Confident, never robotic.
  Big moments (naturals, sweeps, match win) get real energy; routine cues stay
  short and low-key so they don't wear the player down.
- **Keep lines short.** Routine cues under ~2 seconds, celebrations under ~4.
- **Variants:** frequent events have 2–3 alternate takes (`_a`, `_b`, `_c`).
  Play one at random so repetition doesn't grate. Rare events need only one.
- **Format:** mp3 (matches `src/assets/bg_music/`), mono, 44.1 kHz,
  loudness-normalized to roughly −16 LUFS so no line jumps out over the music.
- **Suggested folders:** `src/assets/voice/` and `src/assets/sfx/`, snake_case
  file names as given below.

---

## 1. Match flow

| File | Trigger | Line |
|---|---|---|
| `welcome.mp3` | Entering the setup screen | "Welcome to Pusoy Trese! Pick your seat and let's play." |
| `match_start_a.mp3` | Seat chosen, match begins | "Seats taken. Let's shuffle up and deal!" |
| `match_start_b.mp3` | (variant) | "Alright, players — thirteen cards, three rows, twelve games. Good luck!" |
| `dealing_a.mp3` | New round dealt | "Here come your cards." |
| `dealing_b.mp3` | (variant) | "Fresh hand, fresh chances." |
| `next_game.mp3` | Advancing to the next game | "On to the next one." |
| `halfway.mp3` | Game 7 of 12 begins | "Halfway there. Every point counts now." |
| `final_game.mp3` | Game 12 of 12 begins | "Last game of the match — make it count!" |

## 2. Banker

| File | Trigger | Line |
|---|---|---|
| `you_are_banker.mp3` | Human becomes banker | "You're the banker now. You play everyone at the table — no pressure." |
| `banker_rotates.mp3` | Banker passes to a bot | "New banker at the table." |
| `banker_warning.mp3` | Human's last game as banker | "Last game with the bank. Make it a good one." |

## 3. Betting

| File | Trigger | Line |
|---|---|---|
| `place_your_bet_a.mp3` | Betting phase opens | "Place your bet — how much per point?" |
| `place_your_bet_b.mp3` | (variant) | "Set your stake." |
| `bet_placed_a.mp3` | Bet confirmed | "Bet's down. Arrange your hand." |
| `bet_placed_b.mp3` | (variant) | "Locked in. Good luck." |
| `big_bet.mp3` | Stake is a large share of balance (suggest >25%) | "Ooh, feeling brave today, are we?" |
| `comeback_stake.mp3` | Player broke — auto-staked the comeback amount | "Out of chips? The house is staking you this round. Win it back!" |

## 4. Arranging the hand

| File | Trigger | Line |
|---|---|---|
| `arrange_start.mp3` | Arranging phase opens | "Back beats middle, middle beats front. Arrange your thirteen." |
| `foul_warning_a.mp3` | Arrangement becomes fouled (either row order broken) | "Careful — that arrangement's a foul." |
| `foul_warning_b.mp3` | (variant) | "Hold on, your rows are out of order." |
| `arrangement_ready_a.mp3` | Arrangement becomes legal & complete | "That works. Score it when you're ready." |
| `arrangement_ready_b.mp3` | (variant) | "Legal hand. Ready when you are." |
| `scoring.mp3` | Score button pressed | "Cards on the table!" |

## 5. Round results (reveal)

Chosen by the player's `moneyDeltas` at reveal. "Big" is a judgement call —
suggest big = more than ~10× the smallest chip.

| File | Trigger | Line |
|---|---|---|
| `round_win_a.mp3` | Player wins the round | "Nice hand — that's your money." |
| `round_win_b.mp3` | (variant) | "You take this one." |
| `round_win_c.mp3` | (variant) | "Winner, winner." |
| `round_win_big.mp3` | Player wins big | "What a round! Rake it in!" |
| `round_loss_a.mp3` | Player loses the round | "Not this time." |
| `round_loss_b.mp3` | (variant) | "The table takes that one." |
| `round_loss_c.mp3` | (variant) | "Ouch. Shake it off." |
| `round_loss_big.mp3` | Player loses big | "That one's going to sting. Deep breath." |
| `round_push.mp3` | Player breaks exactly even | "All square — nobody bleeds this round." |
| `sweep.mp3` | Player wins all three rows vs an opponent (sweep bonus) | "A clean sweep — all three rows!" |
| `swept.mp3` | Player loses all three rows | "Swept! They took every row." |
| `foul_self.mp3` | Player's own hand fouled at scoring | "Fouled hand — that's an automatic loss. Watch those rows." |
| `foul_opponent.mp3` | An opponent fouls | "Someone fouled — free points on the table!" |

## 6. Royalties

Fires when the player's clean hand earns a royalty bonus
(`DEFAULT_ROYALTIES` in `src/game/scoring.ts`).

| File | Trigger | Line |
|---|---|---|
| `royalty_quads.mp3` | Four of a Kind in back (+4) or middle (+8) | "Four of a kind! Royalty bonus!" |
| `royalty_straight_flush.mp3` | Straight Flush in back (+5) or middle (+10) | "A straight flush — beautiful! Bonus points!" |
| `royalty_royal_flush.mp3` | Straight flush is ace-high | "A royal flush! You don't see that every day!" |
| `royalty_middle_full_house.mp3` | Full House in the middle (+2) | "Full house in the middle — extra points." |
| `royalty_middle_trips.mp3` | Trips in the middle (+2) | "Trips in the middle — that pays extra." |
| `royalty_front_trips.mp3` | Trips in the front (+3) | "Trips up front? Gutsy — and it pays!" |

## 7. Special hands (naturals)

One line per natural in `src/game/naturals.ts`. These auto-win the round, so
they deserve the most energy in the whole script.

| File | Trigger | Line |
|---|---|---|
| `natural_pure_dragon.mp3` | Pure Dragon — 2 to Ace, one suit (99 pts) | "A PURE DRAGON! Thirteen cards, one suit! Once in a lifetime, folks!" |
| `natural_dragon.mp3` | Dragon — 2 to Ace (13 pts) | "A dragon! Two through ace — the whole ladder! Automatic win!" |
| `natural_three_flushes.mp3` | Three Flushes (3 pts) | "Three flushes! No arranging needed — that's a natural!" |
| `natural_three_straights.mp3` | Three Straights (3 pts) | "Three straights! The deck did the work — natural win!" |
| `natural_six_pairs.mp3` | Six Pairs (3 pts) | "Six pairs! Everything's doubled — automatic win!" |
| `natural_no_face.mp3` | No Face Cards (3 pts) | "Not a single face card! Believe it or not, that pays!" |
| `natural_all_red.mp3` | 12+ Red Cards (3 pts) | "Red everywhere! Twelve red cards — that's a natural!" |
| `natural_all_black.mp3` | 12+ Black Cards (3 pts) | "Blackout! Twelve black cards — natural win!" |
| `natural_opponent.mp3` | An opponent reveals any natural | "A special hand at the table — the round's over before it started." |

## 8. Game over

| File | Trigger | Line |
|---|---|---|
| `match_win.mp3` | Player tops the final standings | "Twelve games down, and you're on top! Champion of the table!" |
| `match_mid.mp3` | Player finishes 2nd or 3rd | "A solid run. The top spot's waiting next time." |
| `match_loss.mp3` | Player finishes last | "Rough match. The cards owe you one — run it back?" |
| `match_profit.mp3` | Player ends the match up money (can layer after placement line) | "And you're walking away richer. That's what matters." |
| `play_again.mp3` | Play-again clicked | "Back for more? I like it. Shuffling up!" |

## 9. Wallet

| File | Trigger | Line |
|---|---|---|
| `broke.mp3` | Balance drops below the minimum chip | "You're running on empty. Careful out there." |
| `wallet_reset.mp3` | Wallet reset to $1,000 | "Fresh start — a thousand dollars on the house." |
| `division_up.mp3` | A new spending division unlocks on the setup screen | "You've unlocked a higher division. The stakes just got real." |

---

## Optional: Taglish alternates

The game is Filipino — a few Taglish takes give it character. Record as extra
variants and mix them into the random pool.

| File | Replaces | Line |
|---|---|---|
| `tg_round_win.mp3` | round win variant | "Ayos! Sa'yo 'yan!" |
| `tg_round_loss.mp3` | round loss variant | "Sayang! Next round na lang." |
| `tg_sweep.mp3` | sweep variant | "Walis! Kinuha lahat ng tatlong row!" |
| `tg_foul_self.mp3` | foul variant | "Pusoy! Mali ang ayos — talo agad." |
| `tg_match_win.mp3` | match win variant | "Panalo ka, boss! Ikaw ang hari ng mesa!" |
| `tg_dealing.mp3` | dealing variant | "Heto na ang baraha mo." |

---

## Sound effects shot list

Non-voice SFX to record or source. Same folder conventions (`src/assets/sfx/`).

| File | Trigger | Description |
|---|---|---|
| `card_shuffle.mp3` | New round dealt | Riffle shuffle, ~1s |
| `card_deal.mp3` | Cards appear on the table | Quick multi-card flick |
| `card_pick.mp3` | Drag starts on a card | Single card slide/lift |
| `card_drop.mp3` | Card dropped into a zone | Soft card tap |
| `card_swap.mp3` | Two cards swapped | Double flick, slightly springy |
| `card_flip.mp3` | Hands revealed at scoring | Card turn-over snap |
| `chip_place.mp3` | Chip added to the bet | Single chip click |
| `chip_stack.mp3` | Bet placed / winnings collected | Chip stack riffle |
| `chip_slide.mp3` | Money changes hands at reveal | Chips sliding across felt |
| `button_click.mp3` | Generic UI button | Soft click |
| `menu_open.mp3` / `menu_close.mp3` | Settings / hand-types menus | Subtle whoosh in/out |
| `foul_buzzer.mp3` | Foul at reveal | Muted double-buzz — noticeable, not harsh |
| `win_jingle.mp3` | Round won | Short bright 3-note rise |
| `lose_sting.mp3` | Round lost | Short soft 2-note fall |
| `sweep_fanfare.mp3` | Sweep bonus | Bigger version of the win jingle |
| `natural_fanfare.mp3` | Any natural revealed | The biggest hit in the kit — cymbal + fanfare |
| `banker_crown.mp3` | Banker rotates | Regal chime |
| `match_win_fanfare.mp3` | Match won | Full celebration, ~3–4s |
| `match_end.mp3` | Match over (didn't win) | Neutral resolving chord |

---

## Priority order (if recording in passes)

1. **Core loop** — dealing, bet placed, scoring, round win/loss variants,
   foul warning/foul self. These fire every single game.
2. **Celebrations** — sweep, naturals, royalties, match win. Rare but they're
   the reason to have a voice at all.
3. **Flavor** — welcome, banker lines, halfway/final game, wallet lines,
   Taglish alternates.
