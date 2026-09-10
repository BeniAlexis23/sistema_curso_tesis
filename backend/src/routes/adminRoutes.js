import { Router } from 'express'
import {
  createUser, deleteRegistration, downloadDocument, getCurrentUser, getRegistration,
  listRegistrations, listUsers, login, replaceDocument, updateRegistration, updateStatus, updateUser,
} from '../controllers/adminController.js'
import { listPayments, updatePayment } from '../controllers/paymentController.js'
import { exportReportExcel, exportReportPdf, listReport } from '../controllers/reportController.js'
import { authenticateAdmin, requireSuperadmin } from '../middleware/authenticateAdmin.js'
import { uploadOneDocument } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/login', login)
router.use(authenticateAdmin)
router.get('/me', getCurrentUser)
router.get('/users', requireSuperadmin, listUsers)
router.post('/users', requireSuperadmin, createUser)
router.patch('/users/:id', requireSuperadmin, updateUser)
router.get('/registrations', requireSuperadmin, listRegistrations)
router.get('/registrations/:id', requireSuperadmin, getRegistration)
router.patch('/registrations/:id', requireSuperadmin, updateRegistration)
router.delete('/registrations/:id', requireSuperadmin, deleteRegistration)
router.patch('/registrations/:id/status', requireSuperadmin, updateStatus)
router.get('/payments', requireSuperadmin, listPayments)
router.patch('/payments/:id', requireSuperadmin, updatePayment)
router.get('/reports', requireSuperadmin, listReport)
router.get('/reports/pdf', requireSuperadmin, exportReportPdf)
router.get('/reports/excel', requireSuperadmin, exportReportExcel)
router.get('/registrations/:id/documents/:documentId', requireSuperadmin, downloadDocument)
router.put('/registrations/:id/documents/:documentId', requireSuperadmin, uploadOneDocument, replaceDocument)
export default router
