import type { MemberType } from '../models/memberModel'

//single member view
export const memberView = (member: MemberType) => ({
   _id: member._id.toString(),
   fname: member.fname,
   lname: member.lname,
   fullName: member.fullName,
   handle: member.handle,
   email: member.email,
   role: member.role,
   avatarUrl: member.avatarUrl,
   _createdAt: member.createdAt.toISOString(),
   _updatedAt: member.updatedAt.toISOString(),
})
//multiple members view
export const membersView = (members: MemberType[]) => {
   return {
      status: 'success',
      results: members.length,
      data: members.map((member) => memberView(member)),
   }
}
//delete member view
export const deleteMemberView = (member: MemberType) => ({
   status: 'success',
   message: 'Member deleted successfully',
   data: member._id.toString(),
})
//create member view
export const createMemberView = (member: MemberType) => ({
   status: 'success',
   message: 'Member created successfully',
   data: memberView(member),
})
//update member view
export const updateMemberView = (member: MemberType) => ({
   status: 'success',
   message: 'Member updated successfully',
   data: memberView(member),
})