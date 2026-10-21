import { Router } from 'express'
import {
   getMembers,
   getMemberById,
   createMember,
   updateMember,
   deleteMember,
} from '../controllers/memberControllers'

const router = Router()

// Define your member routes here

router.get('/members', getMembers).post('/members', createMember)
router
   .get('/members/:id', getMemberById)
   .put('/members/:id', updateMember)
   .delete('/members/:id', deleteMember)

export { router as memberRoutes }
