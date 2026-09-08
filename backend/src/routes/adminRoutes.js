import { Router } from 'express'
import { deleteRegistration, downloadDocument, getRegistration, listRegistrations, login, replaceDocument, updateRegistration, updateStatus } from '../controllers/adminController.js'
import { listPayments, updatePayment } from '../controllers/paymentController.js'
import { authenticateAdmin } from '../middleware/authenticateAdmin.js'
import { uploadOneDocument } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/login', login)
router.use(authenticateAdmin)
router.get('/registrations', listRegistrations)
router.get('/registrations/:id', getRegistration)
router.patch('/registrations/:id', updateRegistration)
router.delete('/registrations/:id', deleteRegistration)
router.patch('/registrations/:id/status', updateStatus)
router.get('/payments', listPayments)
router.patch('/payments/:id', updatePayment)
router.get('/registrations/:id/documents/:documentId', downloadDocument)
router.put('/registrations/:id/documents/:documentId', uploadOneDocument, replaceDocument)
export default router
