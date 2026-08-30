# Background tracks

The music a loop plays behind its affirmations. The list lives in
`src/stater-videos/stater-videos.service.ts` and is served from
`GET /stater-videos/music`.

## How a loop refers to a track

`AffirmationLoop.backgroundMusicKey` stores the track's **name**, matched
exactly. Two consequences worth knowing before editing the list:

- **Renaming a track orphans existing loops** unless the old name still
  resolves. `RENAMED_SOUNDS` maps every previous name to its current one, and
  `getSoundByName` falls through it.
- **Removing a track orphans them outright.** Withdrawn tracks move to
  `RETIRED_SOUNDS` rather than being deleted: they are not offered when
  building a loop, but they still resolve by name, so a loop built with one
  cooks with the audio it was made with.

A loop that cannot find its music fails to cook with
`Background music not found`, and editing it is rejected by
`affirmation-loop.service.ts` before it starts.

## Offered now

Five tracks, each carrying a name and description supplied by the PO
(SelfRisen Tracks, August 2026).

| Name | Brief |
| --- | --- |
| Uplifting Alpha waves 8-12 Hz | Promotes relaxation while maintaining alertness. |
| Dreamy Beta waves 12-30 Hz | Enhances alertness, concentration, and cognitive functioning. Can elevate energy levels and boost motivation. |
| Rejuvenate Alpha waves 8-12 Hz | Promotes relaxation while maintaining alertness. |
| Theta brainwaves 4-8 Hz | Deep meditation and creativity. Facilitates access to the subconscious, ideal for visualization and affirmations. |
| Cinematic Piano Beta waves 12-30 Hz | Enhances alertness, concentration, and cognitive functioning. Can elevate energy levels and boost motivation. |

## Held back for a later feature

Four tracks are in `RETIRED_SOUNDS`. They are real audio, already hosted, and
were withdrawn only because nobody has matched them to a name and description
from the PO's list — the descriptions they carry now were written for them
here, not supplied. They are kept for a future feature rather than deleted.

| Track | File |
| --- | --- |
| Ambient Piano | `1. Ambient Piano - Main version.mp3` |
| meditation | `meditation.mp3` |
| meditation - No Piano | `meditation (not piano).mp3` |
| Cinematic Piano - Short | `Cinematic Piano - Short.mp3` |

There is also a `Tribal Ceremony` entry commented out in the sound list, on a
signed URL that has probably expired.

## Names on the PO's list with no track to apply them to

These were supplied as renames but do not correspond to any audio the app
serves. They need pairing with a file before they can be used — most likely
they were written against the source library rather than what is in the app.

- Positive energy 432 Hz → **Natural Frequency 432 Hz Theta**
  Resonates with the natural frequencies of the universe. Promotes emotional
  healing, peace and clarity, offering a calming effect.
- Meditation 528 Hz → **Love Frequency 528 Hz**
  Promotes healing and transformation, can induce feelings of love, harmony
  and joy. Associated with DNA repair.
  *Two candidates among the held-back tracks: `meditation` and
  `meditation - No Piano`. Confirm which before using it.*
- **Ambient uplifting Beta waves 12-30 Hz**
  Enhances alertness, concentration, and cognitive functioning.
  *Collides with Uplifting Alpha waves: only one "Ambient Uplifting" track
  exists, and it is already named as Alpha.*
- **Mindful flow Isochronic tones**
  Regular beats of a single tone turned on and off at set intervals.
  Headphones are not required.
- **Ambient Binaural Beats 432 Hz**
  Effective for relaxation, stress reduction, focus enhancement and
  facilitating meditation. Headphones needed.

## Adding a track

1. Upload to the `Background Sounds` bucket.
2. Add it to `getSoundList()` with the name and description the PO supplied.
   Do not invent wording — a track with no agreed description belongs in
   `RETIRED_SOUNDS` until it has one.
3. If it replaces or renames an existing track, add the old name to
   `RENAMED_SOUNDS`.
4. Never delete an entry that a loop might reference. Move it to
   `RETIRED_SOUNDS` instead.
