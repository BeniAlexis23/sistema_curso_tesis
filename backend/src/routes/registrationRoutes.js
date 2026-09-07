import { Router } from 'express'
import { createRegistration } from '../controllers/registrationController.js'
import { uploadDocuments } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/', uploadDocuments, createRegistration)
export default router
