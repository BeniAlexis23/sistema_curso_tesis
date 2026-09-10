const API_URL = import.meta.env.VITE_API_URL || '/api'
const TOKEN_KEY = 'undc_admin_token'
const USER_KEY = 'undc_admin_user'

export const getAdminToken = () => sessionStorage.getItem(TOKEN_KEY)
export const saveAdminToken = (token) => sessionStorage.setItem(TOKEN_KEY, token)
export const getAdminUser = () => {
  try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null') }
  catch { return null }
}
export const saveAdminUser = (user) => sessionStorage.setItem(USER_KEY, JSON.stringify(user))
export const isSuperadmin = () => getAdminUser()?.role === 'superadmin'
export const clearAdminToken = () => {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
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

export const getCurrentUser = () => request('/admin/me')
export const listUsers = () => request('/admin/users')
export const createUser = (data) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) })
export const updateUser = (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const listRegistrations = (status = '') => request(`/admin/registrations${status ? `?status=${status}` : ''}`)
export const getRegistration = (id) => request(`/admin/registrations/${id}`)
export const updateRegistration = (id, data) => request(`/admin/registrations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const deleteRegistration = id => request(`/admin/registrations/${id}`, { method: 'DELETE' })
export const updateRegistrationStatus = (id, status, observation) => request(`/admin/registrations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, observation }) })
export const listPayments = () => request('/admin/payments')
export const updatePayment = (id, data) => request(`/admin/payments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
export const getReport = () => request('/admin/reports')

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
