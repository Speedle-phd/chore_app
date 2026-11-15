import { describe, expect, it } from 'vitest'
import { choreState } from './choreState'

// Same cases as backend/src/domain/chores.test.ts: the two must agree.
describe('choreState (client mirror)', () => {
   it.each<[string, 'anyone' | 'everyone', string[], { memberId: string; status: 'done' | 'skipped' }[], string]>([
      ['anyone: nothing yet', 'anyone', ['a', 'b'], [], 'open'],
      ['anyone: one done settles it', 'anyone', ['a', 'b'], [{ memberId: 'b', status: 'done' }], 'done'],
      ['anyone: skipped', 'anyone', ['a'], [{ memberId: 'a', status: 'skipped' }], 'skipped'],
      ['everyone: one of two', 'everyone', ['a', 'b'], [{ memberId: 'a', status: 'done' }], 'partial'],
      ['everyone: done + skipped', 'everyone', ['a', 'b'], [{ memberId: 'a', status: 'done' }, { memberId: 'b', status: 'skipped' }], 'done'],
      ['everyone: all skipped', 'everyone', ['a', 'b'], [{ memberId: 'a', status: 'skipped' }, { memberId: 'b', status: 'skipped' }], 'skipped'],
      ['everyone, nobody assigned', 'everyone', [], [{ memberId: 'x', status: 'done' }], 'done'],
   ])('%s', (_name, mode, assignees, completions, expected) => {
      expect(choreState(mode, assignees, completions)).toBe(expected)
   })
})
