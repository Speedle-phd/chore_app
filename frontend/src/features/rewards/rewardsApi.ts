import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'

/** Server: backend/src/rewards/rewardViews.ts, domain/rewards.ts */
export type Reward = {
   id: string
   title: string
   description: string
   cost: number
   needsApproval: boolean
   archivedAt: string | null
   createdBy: string
}
export type RedemptionStatus = 'pending' | 'approved' | 'declined' | 'cancelled' | 'refunded'
export type Redemption = {
   id: string
   rewardId: string
   title: string
   cost: number
   /** Whose points. */
   memberId: string
   requestedBy: string
   status: RedemptionStatus
   decidedBy: string | null
   decidedAt: string | null
   note: string
   createdAt: string
}
export type Balance = { earned: number; spent: number; reserved: number; available: number }
export type RewardsOverview = {
   enabled: boolean
   rewards: Reward[]
   /** Managers only. */
   archived: Reward[]
   /** Yours; managers get everyone's. */
   balances: Record<string, Balance>
   pending: Redemption[]
   history: Redemption[]
}
export type RewardInput = { title: string; description: string; cost: number; needsApproval: boolean }
export type DecisionAction = 'approve' | 'decline' | 'cancel' | 'refund'

const base = (hid: string) => `/households/${hid}/rewards`
// One prefix: the live 'rewards' notice (and chores, which change balances) refresh all of it.
const rewardsKey = (hid: string) => ['household', hid, 'rewards'] as const
const memberKey = (hid: string, mid: string) => [...rewardsKey(hid), 'member', mid] as const

export function useRewards(hid: string) {
   return useQuery({ queryKey: rewardsKey(hid), queryFn: async () => (await api.get<RewardsOverview>(base(hid))).data })
}

/** A member's balance and latest requests (themselves or managers; pass enabled=false otherwise). */
export function useMemberRewards(hid: string, mid: string, enabled: boolean) {
   return useQuery({
      queryKey: memberKey(hid, mid),
      queryFn: async () => (await api.get<{ balance: Balance; recent: Redemption[] }>(`${base(hid)}/members/${mid}`)).data,
      enabled,
   })
}

function useRefresh(hid: string) {
   const queryClient = useQueryClient()
   return () => queryClient.invalidateQueries({ queryKey: rewardsKey(hid) })
}

export function useSaveReward(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ id, input }: { id: string | null; input: RewardInput }) =>
         id ? (await api.patch<Reward>(`${base(hid)}/${id}`, input)).data : (await api.post<Reward>(base(hid), input)).data,
      onSuccess: refresh,
   })
}

export function useArchiveReward(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ id, archived }: { id: string; archived: boolean }) =>
         (await api.post<Reward>(`${base(hid)}/${id}/${archived ? 'archive' : 'restore'}`)).data,
      onSuccess: refresh,
   })
}

export function useDeleteReward(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async (id: string) => {
         await api.delete(`${base(hid)}/${id}`)
      },
      onSuccess: refresh,
   })
}

export function useRedeem(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ rewardId, memberId }: { rewardId: string; memberId: string }) =>
         (await api.post<Redemption>(`${base(hid)}/${rewardId}/redeem`, { memberId })).data,
      onSettled: refresh,
   })
}

export function useDecide(hid: string) {
   const refresh = useRefresh(hid)
   return useMutation({
      mutationFn: async ({ id, action, note = '' }: { id: string; action: DecisionAction; note?: string }) =>
         (await api.post<Redemption>(`${base(hid)}/redemptions/${id}/${action}`, { note })).data,
      onSettled: refresh,
   })
}
