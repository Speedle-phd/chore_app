import { describe, expect, it } from 'vitest'
import { toggleReaction, type ChatMessage } from './chatApi'

const msg = (reactions: ChatMessage['reactions']): ChatMessage => ({
   id: 'm',
   authorId: 'ann',
   text: 'hi',
   deleted: false,
   editedAt: null,
   reactions,
   createdAt: '2026-11-17T10:00:00.000Z',
})

describe('toggleReaction', () => {
   it('adds a new emoji at the end', () => {
      expect(toggleReaction(msg([{ emoji: '👍', count: 1, memberIds: ['ann'] }]), '🎉', 'ben').reactions).toEqual([
         { emoji: '👍', count: 1, memberIds: ['ann'] },
         { emoji: '🎉', count: 1, memberIds: ['ben'] },
      ])
   })
   it('joins an existing emoji', () => {
      expect(toggleReaction(msg([{ emoji: '👍', count: 1, memberIds: ['ann'] }]), '👍', 'ben').reactions).toEqual([{ emoji: '👍', count: 2, memberIds: ['ann', 'ben'] }])
   })
   it('takes mine back, dropping an emoji nobody uses any more', () => {
      expect(toggleReaction(msg([{ emoji: '👍', count: 2, memberIds: ['ann', 'ben'] }]), '👍', 'ben').reactions).toEqual([{ emoji: '👍', count: 1, memberIds: ['ann'] }])
      expect(toggleReaction(msg([{ emoji: '👍', count: 1, memberIds: ['ben'] }]), '👍', 'ben').reactions).toEqual([])
   })
})
