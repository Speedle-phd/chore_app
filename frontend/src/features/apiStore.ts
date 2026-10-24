import { create } from 'zustand'
import type { Member } from "./memberStore"
import { api } from '@/api/client';
type ApiStore = {
   createMembers: (payload: MemberPayload) => Promise<Member>
}
type MemberPayload = Omit<Member, "_id" | "_createdAt" | "_updatedAt">

export const useMembers = create<ApiStore>()((_set) => ({
   createMembers: async(payload: MemberPayload) => {
      try {
         const response = await api.post("/members", payload)
         if (response.statusText !== "ok") {
            throw new Error("not ok")
         }
         return response.data
      } catch (err) {
         console.error(err)
      }
   }
}))
