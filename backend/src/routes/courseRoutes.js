import { Router } from 'express'
import { getActiveCourse } from '../controllers/courseController.js'

const router = Router()
router.get('/active', getActiveCourse)
export default router
