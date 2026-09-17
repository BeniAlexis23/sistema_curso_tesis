const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'undc_admin_token'

export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY)
export const saveAdminToken = (token) => sessionStorage.setItem(TOKEN_KEY, token)
export const clearAdminToken = () => sessionStorage.removeItem(TOKEN_KEY)

export function getAdminSession() {
  try {
    const payload = getAdminToken()?.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(normalized), character => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null }
}

export const hasAdminPermission = permission => getAdminSession()?.permissions?.includes(permission) || false

export function getAdminHomePath() {
  const permissions = getAdminSession()?.permissions || []
  if (permissions.includes('registrations.view')) return '/admin'
  if (permissions.includes('payments.view')) return '/admin/pagos'
  if (permissions.includes('reports.view')) return '/admin/reportes'
  if (permissions.includes('registration_attendance.export')) return '/admin/asistencias/fichas'
  if (permissions.includes('attendance.view')) return '/admin/asistencias'
  if (permissions.includes('users.view')) return '/admin/usuarios'
  if (permissions.includes('roles.view')) return '/admin/roles'
  return '/admin/login'
}

async function readResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  if (!response.ok) throw Object.assign(new Error('El servidor no está disponible. Inténtalo nuevamente en unos momentos.'), { status: response.status })
  return null
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}`, ...options.headers },
  })
  const result = await readResponse(response)
  if (!response.ok) throw Object.assign(new Error(result.message || 'Ocurrió un error'), { status: response.status })
  return result
}

export async function loginAdmin(credentials) {
  const response = await fetch(`${API_URL}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) })
  const result = await readResponse(response)
  if (!response.ok) throw new Error(result.message || 'No se pudo iniciar sesión')
  return result
}

export const listRegistrations = (status = '') => request(`/admin/registrations${status ? `?status=${status}` : ''}`)
export const getRegistration = (id) => request(`/admin/registrations/${id}`)
export const updateRegistration = (id, data) => request(`/admin/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRegistration = id => request(`/admin/registrations/${id}`, { method: 'DELETE' })
export const updateRegistrationStatus = (id, status, observation) => request(`/admin/registrations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, observation }) })
export const listPayments = () => request('/admin/payments')
export const updatePayment = (id, data) => request(`/admin/payments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const getReport = () => request('/admin/reports')
export const listUsers = () => request('/admin/users')
export const listUserRoleOptions = () => request('/admin/users/role-options')
export const createUser = data => request('/admin/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteUser = id => request(`/admin/users/${id}`, { method: 'DELETE' })
export const listRoles = () => request('/admin/roles')
export const createRole = data => request('/admin/roles', { method: 'POST', body: JSON.stringify(data) })
export const updateRole = (id, data) => request(`/admin/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRole = id => request(`/admin/roles/${id}`, { method: 'DELETE' })
export const listPermissions = () => request('/admin/permissions')
export const getAttendance = () => request('/admin/attendance')
export const updateAttendanceConformity = enabled => request('/admin/attendance/conformity', { method: 'PATCH', body: JSON.stringify({ enabled }) })
export const assignAttendanceTeacher = (moduleId, teacherId) => request(`/admin/attendance/modules/${moduleId}/teacher`, { method: 'PATCH', body: JSON.stringify({ teacherId }) })
export const updateAttendanceSession = (sessionId, data) => request(`/admin/attendance/sessions/${sessionId}`, { method: 'PATCH', body: JSON.stringify(data) })
export const updateTeacherAttendance = (sessionId, data) => request(`/admin/attendance/sessions/${sessionId}/times`, { method: 'PATCH', body: JSON.stringify(data) })
export const markTeacherCheckIn = sessionId => request(`/admin/attendance/sessions/${sessionId}/check-in`, { method: 'POST' })
export const markTeacherCheckOut = sessionId => request(`/admin/attendance/sessions/${sessionId}/check-out`, { method: 'POST' })
export const getRegistrationAttendance = sessionId => request(`/admin/attendance/sessions/${sessionId}/students`)
export const saveRegistrationAttendance = (sessionId, entries) => request(`/admin/attendance/sessions/${sessionId}/students`, { method: 'PUT', body: JSON.stringify({ entries }) })
export const listRegistrationAttendanceSessions = () => request('/admin/attendance/students/exportable-sessions')

export async function downloadAllRegistrationAttendance(format) {
  const response = await fetch(`${API_URL}/admin/attendance/students/export/${format}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  })
  if (!response.ok) {
    const result = await readResponse(response)
    throw new Error(result?.message || 'No se pudieron exportar las asistencias de estudiantes')
  }
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `asistencia-estudiantes-todos-los-modulos.${format === 'excel' ? 'xlsx' : 'pdf'}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export async function downloadRegistrationAttendance(sessionId, format) {
  const response = await fetch(`${API_URL}/admin/attendance/sessions/${sessionId}/students/export/${format}`, {
    headers: { Authorization: `Bearer ${getAdminToken()}` },
  })
  if (!response.ok) {
    const result = await readResponse(response)
    throw new Error(result?.message || 'No se pudo exportar la asistencia de estudiantes')
  }
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `asistencia-estudiantes.${format === 'excel' ? 'xlsx' : 'pdf'}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export async function downloadAttendanceReport(format, moduleId = '') {
  const query = moduleId ? `?moduleId=${moduleId}` : ''
  const response = await fetch(`${API_URL}/admin/attendance/export/${format}${query}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
  if (!response.ok) {
    const result = await readResponse(response)
    throw new Error(result?.message || 'No se pudo generar el reporte de asistencias')
  }
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `asistencia-docentes.${format === 'excel' ? 'xlsx' : 'pdf'}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export async function downloadReport(format) {
  const response = await fetch(`${API_URL}/admin/reports/${format}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
  if (!response.ok) throw new Error('No se pudo generar el reporte')
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/)?.[1] || `reporte-inscripciones.${format === 'excel' ? 'xlsx' : 'pdf'}`
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
}

export async function downloadRegistrationDocument(registrationId, document) {
  const response = await fetch(`${API_URL}/admin/registrations/${registrationId}/documents/${document.id}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
  if (!response.ok) throw new Error('No se pudo descargar el documento')
  const url = URL.createObjectURL(await response.blob())
  const link = window.document.createElement('a')
  link.href = url; link.download = document.original_name; link.click(); URL.revokeObjectURL(url)
}

export async function getDocumentPreview(registrationId, documentId) {
  const response = await fetch(`${API_URL}/admin/registrations/${registrationId}/documents/${documentId}`, { headers: { Authorization: `Bearer ${getAdminToken()}` } })
  if (!response.ok) throw new Error('No se pudo cargar la vista previa')
  return URL.createObjectURL(await response.blob())
}

export async function replaceRegistrationDocument(registrationId, documentId, file) {
  const formData = new FormData()
  formData.append('document', file)
  const response = await fetch(`${API_URL}/admin/registrations/${registrationId}/documents/${documentId}`, {
    method: 'PUT', headers: { Authorization: `Bearer ${getAdminToken()}` }, body: formData,
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'No se pudo reemplazar el documento')
  return result
}
