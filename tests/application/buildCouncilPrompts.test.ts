import { describe, it, expect } from 'vitest'
import {
  buildDrafterMessages,
  buildDrafterMessagesWithTools,
  buildDebateMessages,
  buildDebateMessagesWithTools,
  buildSynthesisMessages,
  anonymizeOthers,
} from '@/application/buildCouncilPrompts'

describe('buildCouncilPrompts', () => {
  it('drafter messages: system + user', () => {
    const msgs = buildDrafterMessages('explain quicksort')
    expect(msgs).toHaveLength(2)
    expect(msgs[0]?.role).toBe('system')
    expect(msgs[1]?.content).toBe('explain quicksort')
  })

  it('anonymizeOthers excludes self and relabels as X/Y', () => {
    const drafts = [
      { slot: 'A' as const, content: 'a' },
      { slot: 'B' as const, content: 'b' },
      { slot: 'C' as const, content: 'c' },
    ]
    const result = anonymizeOthers(drafts, 'B')
    expect(result).toEqual([
      { label: 'X', content: 'a' },
      { label: 'Y', content: 'c' },
    ])
  })

  it('debate prompt includes self draft + anonymized others, never own slot label', () => {
    const others = [
      { label: 'X', content: 'other1' },
      { label: 'Y', content: 'other2' },
    ]
    const msgs = buildDebateMessages({
      userTask: 't',
      myDraft: 'mine',
      myPreviousDebate: null,
      othersLatest: others,
      round: 1,
      totalRounds: 2,
    })
    const userContent = msgs[1]?.content ?? ''
    expect(userContent).toContain('mine')
    expect(userContent).toContain('other1')
    expect(userContent).toContain('other2')
    expect(userContent).not.toMatch(/Drafter [ABC]\b/)
    expect(userContent).toContain('Drafter X')
    expect(userContent).toContain('Drafter Y')
  })

  it('debate round 2+ includes the previous round own response', () => {
    const msgs = buildDebateMessages({
      userTask: 't',
      myDraft: 'd0',
      myPreviousDebate: 'r1-position',
      othersLatest: [{ label: 'X', content: 'theirs' }],
      round: 2,
      totalRounds: 3,
    })
    expect(msgs[1]?.content).toContain('r1-position')
  })

  it('final debate round prompts a closing argument', () => {
    const msgs = buildDebateMessages({
      userTask: 't',
      myDraft: 'd',
      myPreviousDebate: null,
      othersLatest: [{ label: 'X', content: 'o' }],
      round: 3,
      totalRounds: 3,
    })
    const sys = msgs[0]?.content ?? ''
    expect(sys).toMatch(/closing argument|final debate round/i)
  })

  it('synthesis messages include drafts and all debate rounds', () => {
    const msgs = buildSynthesisMessages({
      userTask: 'task',
      drafts: [
        { slot: 'A', content: 'da' },
        { slot: 'B', content: 'db' },
      ],
      debateRounds: [
        [
          { slot: 'A', content: 'r1a' },
          { slot: 'B', content: 'r1b' },
        ],
        [
          { slot: 'A', content: 'r2a' },
          { slot: 'B', content: 'r2b' },
        ],
      ],
    })
    const userContent = msgs[1]?.content ?? ''
    expect(userContent).toContain('da')
    expect(userContent).toContain('r1a')
    expect(userContent).toContain('r2b')
    expect(userContent).toContain('Round 1')
    expect(userContent).toContain('Round 2')
  })
})

describe('buildDrafterMessagesWithTools', () => {
  it('includes all three tool names in the system prompt', () => {
    const msgs = buildDrafterMessagesWithTools(
      'task',
      ['google_search', 'google_news', 'fetch_html'],
      3,
    )
    const system = msgs[0]
    expect(system?.role).toBe('system')
    expect(system?.content).toContain('google_search')
    expect(system?.content).toContain('google_news')
    expect(system?.content).toContain('fetch_html')
  })

  it('interpolates maxCalls into the budget directive', () => {
    const msgs = buildDrafterMessagesWithTools('task', ['google_search'], 4)
    expect(msgs[0]?.content).toContain('max 4 tool calls')
  })

  it('only lists the allowed subset of tools', () => {
    const msgs = buildDrafterMessagesWithTools('task', ['google_search'], 3)
    const system = msgs[0]?.content ?? ''
    expect(system).toContain('google_search')
    expect(system).not.toContain('google_news:')
    expect(system).not.toContain('fetch_html:')
  })
})

describe('buildDebateMessagesWithTools', () => {
  it('appends the tools block to the base debate system prompt', () => {
    const args = {
      userTask: 'task',
      myDraft: 'draft',
      myPreviousDebate: null,
      othersLatest: [],
      round: 1,
      totalRounds: 2,
      allowedTools: ['google_search', 'fetch_html'] as const,
      maxCalls: 2,
    }
    const msgs = buildDebateMessagesWithTools(args)
    expect(msgs[0]?.content).toContain('debate round (1/2)')
    expect(msgs[0]?.content).toContain('max 2 tool calls')
  })
})

describe('buildDrafterMessages (regression)', () => {
  it('does not mention tools', () => {
    const msgs = buildDrafterMessages('task')
    expect(msgs[0]?.content).not.toContain('google_search')
    expect(msgs[0]?.content).not.toContain('tool calls')
  })
})

describe('buildDebateMessages (regression)', () => {
  it('does not mention tools', () => {
    const msgs = buildDebateMessages({
      userTask: 'task',
      myDraft: 'draft',
      myPreviousDebate: null,
      othersLatest: [],
      round: 1,
      totalRounds: 2,
    })
    expect(msgs[0]?.content).not.toContain('google_search')
    expect(msgs[0]?.content).not.toContain('tool calls')
  })
})
