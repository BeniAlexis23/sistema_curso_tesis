import { Router } from 'express'
import { downloadDocument, getRegistration, listRegistrations, login, replaceDocument, updateStatus } from '../controllers/adminController.js'
import { authenticateAdmin } from '../middleware/authenticateAdmin.js'
import { uploadOneDocument } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/login', login)
router.use(authenticateAdmin)
router.get('/registrations', listRegistrations)
router.get('/registrations/:id', getRegistration)
router.patch('/registrations/:id/status', updateStatus)
router.get('/registrations/:id/documents/:documentId', downloadDocument)
router.put('/registrations/:id/documents/:documentId', uploadOneDocument, replaceDocument)
export default router
