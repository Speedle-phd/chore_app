import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
//mongodb member schema
export type Member = {
   _id: string,
   fname: string,
   lname: string,
   fullName: string,
   handle: string,
   email: string,
   role: string,
   avatarUrl: string,
   _createdAt: string,
   _updatedAt: string,
}

type MemberStore = {
   members: Member[]
   membersLength: (state: MemberStore) => number
   setMembers: (members: Member[]) => void
   addMember: (newMember: Member) => void
   removeMember: (memberId: Member['_id']) => void
   updateMembers: (newMembers: Member[]) => void
}

export const useMembers = create<MemberStore>()(
   persist(
      (set) => ({
         members: [],
         membersLength: (state) => state.members.length,
         setMembers: (members) => set({ members }),
         addMember: (newMember) =>
            set((state) => ({
               members: [...state.members, newMember],
            })),

         removeMember: (memberId) =>
            set((state) => ({
               members: state.members.filter(
                  (member) => member._id !== memberId,
               ),
            })),

         updateMembers: (newMembers) => set({ members: newMembers }),
      }),
      {
         name: 'members-storage',
         storage: createJSONStorage(() => localStorage),
      },
   ),
)
