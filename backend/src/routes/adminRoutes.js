import { Router } from 'express'
import { deleteRegistration, downloadDocument, getRegistration, listRegistrations, login, replaceDocument, updateRegistration, updateStatus } from '../controllers/adminController.js'
import { listPayments, updatePayment } from '../controllers/paymentController.js'
import { exportReportExcel, exportReportPdf, listReport } from '../controllers/reportController.js'
import { createRole, deleteRole, listPermissions, listRoles, updateRole } from '../controllers/roleController.js'
import { createUser, deleteUser, listUserRoleOptions, listUsers, updateUser } from '../controllers/userController.js'
import {
  assignModuleTeacher, checkIn, checkOut, exportAttendanceExcel,
  exportAttendancePdf, listAttendance, updateAttendance, updateAttendanceConformity, updateSession,
} from '../controllers/attendanceController.js'
import {
  exportAllRegistrationAttendanceExcel, exportAllRegistrationAttendancePdf,
  exportRegistrationAttendanceExcel, exportRegistrationAttendancePdf,
  listRegistrationAttendance, listRegistrationAttendanceSessions, saveRegistrationAttendance,
} from '../controllers/registrationAttendanceController.js'
import {
  exportStaffAttendanceExcel, exportStaffAttendancePdf, listStaffAttendance,
  staffCheckIn, staffCheckOut, updateStaffAttendance,
} from '../controllers/staffAttendanceController.js'
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
router.get('/attendance', requirePermission('attendance.view'), listAttendance)
router.get('/attendance/export/excel', requirePermission('attendance.export'), exportAttendanceExcel)
router.get('/attendance/export/pdf', requirePermission('attendance.export'), exportAttendancePdf)
router.patch('/attendance/conformity', requirePermission('attendance.approve'), updateAttendanceConformity)
router.patch('/attendance/modules/:id/teacher', requirePermission('attendance.manage'), assignModuleTeacher)
router.patch('/attendance/sessions/:id', requirePermission('attendance.manage'), updateSession)
router.patch('/attendance/sessions/:id/times', requirePermission('attendance.manage'), updateAttendance)
router.post('/attendance/sessions/:id/check-in', requirePermission('attendance.mark'), checkIn)
router.post('/attendance/sessions/:id/check-out', requirePermission('attendance.mark'), checkOut)
router.get('/attendance/sessions/:id/students', requirePermission('registration_attendance.view'), listRegistrationAttendance)
router.put('/attendance/sessions/:id/students', requirePermission('registration_attendance.mark'), saveRegistrationAttendance)
router.get('/attendance/students/exportable-sessions', requirePermission('registration_attendance.export'), listRegistrationAttendanceSessions)
router.get('/attendance/students/export/excel', requirePermission('registration_attendance.export'), exportAllRegistrationAttendanceExcel)
router.get('/attendance/students/export/pdf', requirePermission('registration_attendance.export'), exportAllRegistrationAttendancePdf)
router.get('/attendance/sessions/:id/students/export/excel', requirePermission('registration_attendance.export'), exportRegistrationAttendanceExcel)
router.get('/attendance/sessions/:id/students/export/pdf', requirePermission('registration_attendance.export'), exportRegistrationAttendancePdf)
router.get('/staff-attendance', requirePermission('staff_attendance.view'), listStaffAttendance)
router.post('/staff-attendance/sessions/:id/check-in', requirePermission('staff_attendance.mark'), staffCheckIn)
router.post('/staff-attendance/sessions/:id/check-out', requirePermission('staff_attendance.mark'), staffCheckOut)
router.patch('/staff-attendance/:id/times', requirePermission('staff_attendance.manage'), updateStaffAttendance)
router.get('/staff-attendance/export/excel', requirePermission('staff_attendance.export'), exportStaffAttendanceExcel)
router.get('/staff-attendance/export/pdf', requirePermission('staff_attendance.export'), exportStaffAttendancePdf)
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
