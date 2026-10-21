import { api } from '@/api/client'
import { useMembers } from '@/features/memberStore'

export const appLoader = async () => {
   try {
      const response = await api.get('/members')

      if (response.status === 200) {
         // Your backend returns { status: "success", data: [...] }
         const members = response.data.data

         // Access Zustand without calling a React hook
         useMembers.getState().setMembers(members)

         return members
      }

      return []
   } catch (error) {
      console.error('Error in appLoader:', error)
      throw error
   }
}
