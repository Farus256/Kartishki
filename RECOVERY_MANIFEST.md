# Recovery manifest — `recovery/pre-data-loss-restored`

Rebuilt on 2026-09-18 after the working tree of `D:\KARTISHKI` lost the contents of `apps/client`, `apps/server`,
`apps/editor`, `packages/shared` and `packages/i18n` (the tracked files plus the uncommitted work of two sessions).
This repo (`D:\KARTISHKI_REBUILT`) is a plain clone of the damaged repo's Git history (`HEAD` = `4ad5ca2`, 7 commits
ahead of `origin/main`), with the uncommitted work restored on top from the sources below.

## Sources, in order of trust

| Source | What it held |
|---|---|
| Git history (`4ad5ca2`) | every tracked file at its last commit — the baseline |
| `tests/` of the damaged tree (byte-identical to `R9/KARTISHKI/tests/`) | the test files both sessions wrote; they survived and were verified against R9 |
| Session transcript (`~/.claude/projects/D--KARTISHKI/34d2b628-….jsonl` + its persisted `tool-results/`) | (a) full pre-session snapshots of 22 files printed with `cat`/`sed -n` at the start of the session (= the previous session's final state), (b) the complete, ordered log of every `Edit`/`Write`/`sed`/`cat >>` this session made before the loss, (c) partial reads and grep output used as line-level checks |
| Session notes (`memory/battlegrounds-balance-pass-2026-09.md`) | a description of what the previous session changed; used only to classify losses and for one recorded number (ultimate tier ≥ 60000) |
| `R9/` | copy of the surviving tree plus zero-filled shells (name/size/mtime only) of the deleted files — used as byte-size targets |
| `Recuva/`, `UFS/` | no deleted source content (large files zero-filled, small ones stale); nothing was taken from them |

Method: a sandbox tree was built from `git archive HEAD`, the 22 pre-session snapshots were laid over it, and the 95
recorded edit operations were replayed in order (string edits verified to match exactly once; shell edits re-run with
`npx`/`git` stubbed). The replay reproduced the surviving `tests/` files byte-for-byte, which validates the method.
Files whose replayed result differed from a first hand reconstruction were taken from the replay.

## Classification of every file that differs from `HEAD`

Classes: `GIT_BASELINE` (unchanged from Git), `EXACT_R9` (byte-identical to the surviving copy), `EXACT_CONTEXT`
(pre-session snapshot and/or every recorded edit replayed — exact to the last recorded operation), `MERGED_RECOVERY`
(Git baseline + recorded edits; the previous session's untracked changes to the file, if any, are unknown),
`PARTIAL_RECOVERY` (part of the content reconstructed from evidence, marked in-file where it matters),
`UNRECOVERABLE` (known lost, see the last section).

### packages/shared
| File | Class | Notes |
|---|---|---|
| `src/autoBattler.ts` | EXACT_CONTEXT | pre-session snapshot + 8 replayed edits |
| `src/autoBattlerMinions.ts` | EXACT_CONTEXT | pre-session snapshot + 10 replayed edits (215 ids) |
| `src/matchTribes.ts` | EXACT_CONTEXT | pre-session snapshot = HEAD |
| `src/fairness.ts` | EXACT_CONTEXT | pre-session lines 1–140 from two reads (the file was 142 lines; the last two lines are HEAD's unchanged `return`/`}`), + 2 replayed edits |
| `src/cardSets.ts` | MERGED_RECOVERY | HEAD + `CARD_SET_MAX_MINIONS = 260` (recorded edit; lines 60–115 verified equal to HEAD) |
| `src/cosmetics.ts` | PARTIAL_RECOVERY | `cosmeticTier` gains `'ultimate'` at ≥ 60000 (threshold from the session notes). The previous session's `skin-king`/`slam-spit` items, `COSMETIC_DROP_ODDS`/`rollCosmetic` are **not** restored (no source evidence) |
| `src/shop.ts` | GIT_BASELINE | the previous session lowered pack prize weights (mixed 1.5 %, wardrobe 12 %) — values unknown, left at HEAD |

### packages/i18n
| File | Class | Notes |
|---|---|---|
| `src/index.ts` | PARTIAL_RECOVERY | `abTribe_demon`, the wheel-of-fate strings and the 15-anomaly copy are exact (recorded edit / pre-session diff excerpt). The previous session's hero-power names/hints (`spell-thrift`, `hand-token`, `bounty`, free heal/swap) and `tier_ultimate` were rebuilt from a truncated `git diff` excerpt — wording may differ |

### apps/server
| File | Class | Notes |
|---|---|---|
| `src/autoBattler/AutoBattlerRoom.ts` | EXACT_CONTEXT | snapshot + 3 edits (866 → 870 lines) |
| `src/autoBattler/combat.ts` | EXACT_CONTEXT | snapshot (361 lines) |
| `src/autoBattler/combatTypes.ts` | EXACT_CONTEXT | snapshot = HEAD |
| `src/autoBattler/effects.ts` | EXACT_CONTEXT | snapshot + 4 edits |
| `src/autoBattler/instantiate.ts` | EXACT_CONTEXT | snapshot (97 lines) |
| `src/autoBattler/keywords.ts` | EXACT_CONTEXT | snapshot (234 lines) |
| `src/autoBattler/pool.ts` | EXACT_CONTEXT | snapshot (128 lines) |
| `src/autoBattler/recruit.ts` | EXACT_CONTEXT | snapshot + 6 edits |
| `src/autoBattler/triples.ts` | EXACT_CONTEXT | snapshot + 2 edits (103 lines) |
| `src/catalog.ts` | MERGED_RECOVERY | HEAD + `CARD_SET_MAX_MINIONS` (recorded edits; lines 1–60 verified) |
| `data/catalog.json` | PARTIAL_RECOVERY | `autoBattlerMinions`, `autoBattlerHeroes`, `shop` dumps removed as the notes describe; the result is exactly the R9 shell size (275 326 bytes), so the content is very likely identical, but no byte-level oracle exists |
| `test/autoBattler.effects.test.ts` | PARTIAL_RECOVERY | header, the golden-age/anomaly/demon/wheel tests and the appended demon + wheel tests are exact (reads + recorded edits); the echo/spell tests carry `RECONSTRUCTED` markers; **3 of the previous session's 17 tests are missing** (24 730 → 23 176 bytes) |
| `test/autoBattler.match.test.ts` | EXACT_CONTEXT | HEAD + recorded edits; byte size equals the R9 shell (11 919) |
| `test/autoBattler.regression.test.ts` | EXACT_CONTEXT | HEAD + recorded edit; byte size equals the R9 shell (8 659) |
| `test/catalog.test.ts` | EXACT_CONTEXT | HEAD + recorded edits; byte size equals the R9 shell (15 191) |
| `test/autoBattler.test.ts`, `test/autoBattler.network.test.ts`, `test/players.test.ts` | GIT_BASELINE | R9 shells are +162 / +43 / +57 bytes larger than HEAD — small previous-session edits (probably `anomaly: ''` pins) are lost |

### apps/client
| File | Class | Notes |
|---|---|---|
| `src/autoBattlerSession.ts` | EXACT_CONTEXT | HEAD + pre-session lines 25–110 (adds `cost?` on `AbMinion`) + recorded `wheelBonus` edit |
| `src/battlegrounds/BoardRow.tsx`, `HandRow.tsx`, `pointerDnd.ts` | EXACT_CONTEXT | snapshots = HEAD |
| `src/battlegrounds/CombatPlayback.tsx` | EXACT_CONTEXT | snapshot + recorded edits (enemy-hand fan, 750 ms beat) |
| `src/battlegrounds/MinionTile.tsx`, `TavernRow.tsx`, `SpellGlyph.tsx` | EXACT_CONTEXT | snapshots (+ one SpellGlyph edit) |
| `src/battlegrounds/battlegroundsLayout.ts` | EXACT_CONTEXT | snapshot + recorded edits (`lineGap = tavernGap`) |
| `src/battlegrounds/useAbPointerDnd.tsx` | EXACT_CONTEXT | snapshot + 3 recorded edits |
| `src/battlegrounds/WheelOfFate.tsx` | EXACT_CONTEXT | new file, recorded `cat >` content |
| `src/battlegrounds/illustrations.ts` | MERGED_RECOVERY | HEAD + recorded edits (demon family, species fixes); lines 1–80 verified equal to HEAD |
| `src/screens/BattlegroundsScreen.tsx` | EXACT_CONTEXT | snapshot + recorded edits (EnemyHand → WheelOfFate) |
| `src/screens/MainMenuScreen.tsx`, `src/screens/SlotMachine.tsx` | MERGED_RECOVERY | HEAD + recorded edits (3-row reels) |
| `src/battlegrounds/battlegrounds.css`, `fx-combat.css`, `src/cosmetics.css`, `src/shop.css`, `src/style.css` | MERGED_RECOVERY | HEAD + recorded edits (every `sed` pattern matched HEAD, so the touched lines were unchanged by the previous session). The previous session's `skin-king` crown rules in `cosmetics.css` are lost |
| `src/battlegrounds/AnomalyBadge.tsx` | PARTIAL_RECOVERY | glyph set aligned to the exact `AB_ANOMALIES` list; drawings for the new anomalies are reconstructed |
| `src/battlegrounds/abOptimistic.ts` | PARTIAL_RECOVERY | `offerCost(me, offer)` reconstructed (its contract is fixed by the exact `TavernRow`/`useAbPointerDnd`/test files) |
| `src/cosmetics/vfxAudio.ts` | PARTIAL_RECOVERY | `playSlamWindup` reconstructed as a generic sweep (the exact `CombatPlayback` imports it) |
| `src/cosmetics/EnemyHand.tsx` | deleted | recorded `git rm` (replaced by the combat fan) |

### apps/editor
| File | Class | Notes |
|---|---|---|
| `src/EffectsEditor.tsx` | PARTIAL_RECOVERY | TRIGGER/blankAction/UI blocks verified against exact reads; echo summary line and KIND entries from recorded `sed` patterns; demon entries replayed. Any echo-specific form controls the previous session added are unknown |
| `src/BattlegroundsEditor.tsx` | PARTIAL_RECOVERY | `SPELL` label table completed for every spell kind; `summon`/`selfDamage`/`devour` labels exact, the others are reconstructed wording |

### tests
| File | Class |
|---|---|
| `tests/abOptimistic.test.ts`, `tests/battlegroundsLayout.test.ts`, `tests/cosmetics.test.ts`, `tests/matchTribes.test.ts`, `tests/browser/abFixture.ts`, `tests/browser/battlegrounds.spec.ts`, `tests/browser/ab-polish.spec.ts`, `tests/browser/ab-live-polish.spec.ts`, `tests/browser/meta-polish.spec.ts` | EXACT_R9 (surviving originals) |

## Known lost (UNRECOVERABLE)

Previous-session work described in the session notes with no surviving source:
- `playerSession` state on `globalThis.__kartishkiPlayerSession` (Vite-HMR fix) and `nameFx` on ladder rows.
- Cosmetics: `skin-king` (CSS crown + `kingFrame` canvas), `slam-spit` (strike style `hawk`, projectile `spit`), `COSMETIC_DROP_ODDS` / `rollCosmetic`, lowered pack prize weights.
- `HeroPowerTooltip` change ("only rewrites the leading `За $N` / `Pay $N`").
- Three tests in `apps/server/test/autoBattler.effects.test.ts`; small edits in three other server tests (see above).
- Any other previous-session change to a file that was neither snapshotted nor touched by a recorded edit.

## Not part of the rebuilt repo
`R9/`, `Recuva/`, `UFS/` stay in `D:\KARTISHKI` untouched. `.env.local` (DB credentials) was copied for local runs and is git-ignored.
