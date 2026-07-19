# Reflection coach (OMNI-CBT V6.4) — product overview

Plain-language guide for product and design. The live AI instructions live in `src/reflection/prompts/omni-cbt-v6_4.prompt.ts`.

## What it is

When a user shares a thought or limiting belief, the backend runs a CBT-informed reflection coach. It:

1. Checks for safety / crisis risk first
2. Mirrors how they feel (reflective summary)
3. Optionally names a thinking pattern (cognitive distortion)
4. Offers a short, believable “bridge” affirmation
5. Sometimes asks one gentle follow-up question (Socratic pivot)

Tone: **grounded warmth** — calm, precise, non-judgmental. Not a therapist, not crisis care, not toxic positivity.

## User-facing flow

```text
User shares a thought
        ↓
Safety check (always first)
        ↓
┌───────────────────┬────────────────────────────┐
│ Safety risk found │ Normal coaching path       │
│ → safety message  │ → reflection + affirmation │
│ → no affirmation  │ → optional question        │
└───────────────────┴────────────────────────────┘
```

## What the app can show

| Field | What it means for UI |
| --- | --- |
| `reflectiveSummary` | Empathy mirror in second person (“It sounds like…”). Primary text to display. |
| `generatedAffirmation` | First-person bridge affirmation (“I am learning to…”). Show only when present. |
| `socraticPivot` | Optional follow-up question. Hide when null. |
| `primaryEmotion` | Emotion label (e.g. Anxiety, Shame, Hope). Useful for chips / theming. |
| `intensity` | High / Medium / Low emotional weight. Can drive layout emphasis. |
| `detectedDistortion` | Thinking pattern label, or none. Optional educational detail. |
| `supportType` | Mode of response: reframe, validation, celebration, grounding, safety, fallback. |
| `userContext` | Short quote of the user’s own words. Good for “you said…” continuity. |
| `isSafetyIssue` | If true, switch to safety UI — no affirmation, no coaching reframes. |
| `riskLevel` | none / unclear / elevated / imminent — calibrate urgency of safety copy. |

## Two main paths

### Normal coaching
- User vents or shares a personal belief
- Show reflection → affirmation → optional question
- Affirmations stay under ~18 words and use growth-oriented phrasing (“I am becoming…”, “I am open to the possibility that…”)

### Safety
- Self-harm, harm to others, abuse, immediate danger, psychosis risk, eating-disorder risk, etc.
- **Do not** show affirmations or distortion coaching
- Show the safety-focused `reflectiveSummary` only
- Prefer calm, action-oriented help (trusted person, local emergency services). Do not invent hotline numbers when location is unknown; US users may see 988 mentioned by the model

## Input types (behind the scenes)

| Type | Product expectation |
| --- | --- |
| `personal_belief` | Full coaching experience |
| `mental_health_education` | Short educational answer; light coaching |
| `unrelated` / `gibberish` | Soft fallback — don’t force a deep reframe |
| `safety` | Safety UI only |

## Design reminders

- This is **supportive reflection**, not diagnosis or treatment
- Prefer the user’s own words in the mirror (`userContext` / quoted fragments in the summary)
- Celebration / gratitude moments may skip the follow-up question
- Safety always wins over format and over “helpful” coaching

## Source of truth

- Protocol / prompt: `src/reflection/prompts/omni-cbt-v6_4.prompt.ts`
- Types & NLP call: `src/reflection/services/nlp-transformation.service.ts`
