import { Router } from 'express'
import {
  createUser, deleteRegistration, downloadDocument, getCurrentUser, getRegistration,
  listRegistrations, listUsers, login, replaceDocument, updateRegistration, updateStatus, updateUser,
} from '../controllers/adminController.js'
import { listPayments, updatePayment } from '../controllers/paymentController.js'
import { exportReportExcel, exportReportPdf, listReport } from '../controllers/reportController.js'
import { authenticateAdmin } from '../middleware/authenticateAdmin.js'
import { uploadOneDocument } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/login', login)
router.use(authenticateAdmin)
router.get('/me', getCurrentUser)
router.get('/users', listUsers)
router.post('/users', createUser)
router.patch('/users/:id', updateUser)
router.get('/registrations', listRegistrations)
router.get('/registrations/:id', getRegistration)
router.patch('/registrations/:id', updateRegistration)
router.delete('/registrations/:id', deleteRegistration)
router.patch('/registrations/:id/status', updateStatus)
router.get('/payments', listPayments)
router.patch('/payments/:id', updatePayment)
router.get('/reports', listReport)
router.get('/reports/pdf', exportReportPdf)
router.get('/reports/excel', exportReportExcel)
router.get('/registrations/:id/documents/:documentId', downloadDocument)
router.put('/registrations/:id/documents/:documentId', uploadOneDocument, replaceDocument)
export default router
