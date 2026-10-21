import type { Request, Response, NextFunction } from 'express'
import { Member } from '../models/memberModel'
import { NotFoundError, BadRequestError } from '../errors'
import { memberView, membersView, createMemberView, updateMemberView, deleteMemberView } from '../views/memberViews'
import { StatusCodes } from 'http-status-codes'


export const getMembers = async (_: Request, res: Response, next: NextFunction) => {
   try {
      const members = await Member.find()
      res.status(StatusCodes.OK).json(membersView(members))
   } catch (error) {
      next(error)
   }
}

export const getMemberById = async (
   req: Request,
   res: Response,
   next: NextFunction,
): Promise<void> => {
   try {
      const member = await Member.findById(req.params.id)
      if (!member) {
         throw new NotFoundError('Member not found')
      }
      res.status(StatusCodes.OK).json(memberView(member))
   } catch (error) {
      next(error)
   }
}

export const createMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
   try {
      const newMember = new Member(req.body)
      if (!newMember.fname || !newMember.lname) {
         throw new BadRequestError('First name and last name are required')
      }
      newMember.fullName = `${newMember.fname} ${newMember.lname}`
      const savedMember = await newMember.save()
      res.status(StatusCodes.CREATED).json(createMemberView(savedMember))
   } catch (error) {
      next(error)
   }
}

export const updateMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
   try {
      const updatedMember = await Member.findByIdAndUpdate(
         req.params.id,
         req.body,
         { new: true },
      )
      if (!updatedMember) {
         throw new NotFoundError('Member not found')
      }
      res.status(StatusCodes.OK).json(updateMemberView(updatedMember))
   } catch (error) {
      next(error)
   }
}

export const deleteMember = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
   try {
      const deletedMember = await Member.findByIdAndDelete(req.params.id)
      if (!deletedMember) {
         throw new NotFoundError('Member not found')
      }
      res.status(StatusCodes.NO_CONTENT).json(deleteMemberView(deletedMember))
   } catch (error) {
      next(error)
   }
}
