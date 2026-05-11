import type { DrafterSlot } from '@/domain/council'

export type ChatMessage = Readonly<{
  role: 'system' | 'user' | 'assistant'
  content: string
}>

const LANGUAGE_DIRECTIVE = `LANGUAGE: Reply in the same natural language as the user's task. If the user wrote in Spanish, answer in Spanish; in French, French; in Portuguese, Portuguese; in Japanese, Japanese; etc. This applies to your entire output, including any critique, reasoning, or closing arguments. Match the user's language even though these instructions are written in English. Code identifiers, library/API names, and technical proper nouns stay as-is.`

const DRAFTER_SYSTEM = `${LANGUAGE_DIRECTIVE}

You are one of three independent expert drafters in a council.
Produce your best, complete answer to the user's task. Be thorough but concise.
Do not refer to "other models" or imagine what others would say. Just answer.
If the task requires code, provide working code with brief context.
If the task is open-ended, structure your answer in clear sections.`

export function buildDrafterMessages(userTask: string): ReadonlyArray<ChatMessage> {
  return [
    { role: 'system', content: DRAFTER_SYSTEM },
    { role: 'user', content: userTask },
  ]
}

/**
 * A debate prompt where the model must defend its own position AND critique others.
 * Anonymized: the model never knows which model produced each opposing answer.
 *
 * Round 1 of debate uses the original drafts as input.
 * Round 2+ uses the previous round's debate responses (each model has refined position).
 */
export function buildDebateMessages(args: {
  userTask: string
  myDraft: string
  myPreviousDebate: string | null
  othersLatest: ReadonlyArray<{ label: string; content: string }>
  round: number
  totalRounds: number
}): ReadonlyArray<ChatMessage> {
  const { userTask, myDraft, myPreviousDebate, othersLatest, round, totalRounds } = args

  const othersBlock = othersLatest
    .map((d) => `--- Drafter ${d.label} ---\n${d.content}`)
    .join('\n\n')

  const isFirstRound = round === 1
  const isFinalRound = round === totalRounds

  const system = `${LANGUAGE_DIRECTIVE}

You are one of three drafters in a council debate.
You produced the answer below as your own draft. The other drafters' answers (or their last debate responses) are anonymized — you DO NOT KNOW which model wrote each. Do not speculate which is which; treat them as opaque positions.

Your job in this debate round (${round}/${totalRounds}):
1. **Defend your position**: state precisely why your approach is correct, citing specific reasoning. Acknowledge if the others raised a valid point that strengthens your position.
2. **Critique the others** with concrete arguments: where are they wrong, incomplete, or weaker than your answer? Be specific (line, claim, or assumption).
3. **Concede genuinely** where one of them is clearly better than what you wrote. Do not be falsely diplomatic — if you were wrong on a point, say so.
${isFinalRound
  ? '4. **This is the final debate round.** Make your closing argument: what should the chairman take from your position into the synthesis?'
  : '4. End with your *current* best position on the task in 2-3 sentences (this will be your input to the next round).'}

Format: plain prose, ~200-350 words. No JSON. No headings unless absolutely necessary.
Be direct. The chairman will read all of this and decide.`

  const userParts: string[] = [
    `Original task:\n${userTask}`,
    `\nYour own original draft:\n${myDraft}`,
  ]
  if (!isFirstRound && myPreviousDebate) {
    userParts.push(`\nYour position from the previous debate round:\n${myPreviousDebate}`)
  }
  userParts.push(
    `\nOther drafters' ${isFirstRound ? 'drafts' : 'previous debate positions'} (anonymized):\n${othersBlock}`,
  )
  userParts.push(
    `\nThis is debate round ${round} of ${totalRounds}. Defend, critique, and ${isFinalRound ? 'make your closing argument now.' : 'state your refined position.'}`,
  )

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n') },
  ]
}

/**
 * Synthesis prompt for the chairman. Receives:
 * - Original task
 * - Initial drafts (anonymized A/B/C)
 * - All debate rounds (final positions per drafter, plus the back-and-forth)
 *
 * The chairman's output is the user-facing final answer.
 */
export function buildSynthesisMessages(args: {
  userTask: string
  drafts: ReadonlyArray<{ slot: DrafterSlot; content: string }>
  debateRounds: ReadonlyArray<
    ReadonlyArray<{ slot: DrafterSlot; content: string }>
  >
}): ReadonlyArray<ChatMessage> {
  const { userTask, drafts, debateRounds } = args

  const draftsBlock = drafts
    .map((d) => `--- Drafter ${d.slot} ---\n${d.content}`)
    .join('\n\n')

  const roundsBlock = debateRounds
    .map(
      (round, i) =>
        `=== Debate Round ${i + 1} ===\n` +
        round
          .map((r) => `--- Drafter ${r.slot} ---\n${r.content}`)
          .join('\n\n'),
    )
    .join('\n\n')

  const system = `${LANGUAGE_DIRECTIVE}

You are the chairman of a council of three drafters who answered the same task.
You have all initial drafts (anonymized A/B/C) and the full record of ${debateRounds.length} debate round(s) where each drafter defended their position and critiqued the others.

Your output has TWO parts in this exact format:

PART 1 — the final answer for the user.
- Incorporates the strongest, most defensible points across all positions.
- Resolves contradictions by judging which side prevailed in the debate.
- Discards weak or hallucinated claims that the debate exposed.
- Written directly to the user — no meta-commentary about the council.
- Format naturally (code if asked for code, explanation if asked for explanation).
- Do NOT preface with "After reviewing the drafts..." or "The council determined...".

Then on its own line, exactly this marker (no extra characters, no spaces):

===COUNCIL_REASONING===

PART 2 — your reasoning, addressed to the user.
- 100-200 words explaining your decisions.
- Which drafter's points did you incorporate? Which did you reject and why?
- Where did you resolve a contradiction, and how?
- Refer to drafters by their letter (A/B/C). Be honest and specific.

Begin PART 1 now.`

  const user = `Original task:
${userTask}

Initial drafts:
${draftsBlock}

Full debate:
${roundsBlock}

Now produce the final answer.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

/**
 * Returns the other drafters' content with self excluded, relabeled as X/Y/Z.
 * Guarantees the critic never sees their own slot label.
 */
export function anonymizeOthers(
  allItems: ReadonlyArray<{ slot: DrafterSlot; content: string }>,
  myslot: DrafterSlot,
): ReadonlyArray<{ label: string; content: string }> {
  const labels = ['X', 'Y', 'Z']
  const others = allItems.filter((d) => d.slot !== myslot)
  return others.map((d, i) => ({
    label: labels[i] ?? '?',
    content: d.content,
  }))
}
