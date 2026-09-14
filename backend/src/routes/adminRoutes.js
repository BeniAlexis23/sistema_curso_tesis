import { Router } from 'express'
import { deleteRegistration, downloadDocument, getRegistration, listRegistrations, login, replaceDocument, updateRegistration, updateStatus } from '../controllers/adminController.js'
import { listPayments, updatePayment } from '../controllers/paymentController.js'
import { exportReportExcel, exportReportPdf, listReport } from '../controllers/reportController.js'
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from '../controllers/roleController.js'
import { createUser, deleteUser, listUserRoleOptions, listUsers, updateUser } from '../controllers/userController.js'
import { authenticateAdmin } from '../middleware/authenticateAdmin.js'
import { requirePermission } from '../middleware/requirePermission.js'
import { uploadOneDocument } from '../middleware/uploadDocuments.js'

const router = Router()
router.post('/login', login)
router.use(authenticateAdmin)
router.get('/registrations', requirePermission('registrations.view'), listRegistrations)
router.get('/registrations/:id', requirePermission('registrations.view'), getRegistration)
router.patch('/registrations/:id', requirePermission('registrations.manage'), updateRegistration)
router.delete('/registrations/:id', requirePermission('registrations.delete'), deleteRegistration)
router.patch('/registrations/:id/status', requirePermission('registrations.manage'), updateStatus)
router.get('/payments', requirePermission('payments.view'), listPayments)
router.patch('/payments/:id', requirePermission('payments.manage'), updatePayment)
router.get('/reports', requirePermission('reports.view'), listReport)
router.get('/reports/pdf', requirePermission('reports.export'), exportReportPdf)
router.get('/reports/excel', requirePermission('reports.export'), exportReportExcel)
router.get('/registrations/:id/documents/:documentId', requirePermission('registrations.view'), downloadDocument)
router.put('/registrations/:id/documents/:documentId', requirePermission('registrations.manage'), uploadOneDocument, replaceDocument)
router.get('/users', requirePermission('users.view'), listUsers)
router.get('/users/role-options', requirePermission('users.manage'), listUserRoleOptions)
router.post('/users', requirePermission('users.manage'), createUser)
router.patch('/users/:id', requirePermission('users.manage'), updateUser)
router.delete('/users/:id', requirePermission('users.manage'), deleteUser)
router.get('/permissions', requirePermission('roles.view'), listPermissions)
router.get('/roles', requirePermission('roles.view'), listRoles)
router.post('/roles', requirePermission('roles.manage'), createRole)
router.patch('/roles/:id', requirePermission('roles.manage'), updateRole)
router.delete('/roles/:id', requirePermission('roles.manage'), deleteRole)
export default router
