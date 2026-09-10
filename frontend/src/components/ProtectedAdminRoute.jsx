import { Navigate } from 'react-router-dom'
import { getAdminToken, getAdminUser } from '../services/adminService'

export default function ProtectedAdminRoute({ children, requiredRole }) {
  const token = getAdminToken()
  if (!token) return <Navigate to="/admin/login" replace />

  if (requiredRole === 'superadmin') {
    const user = getAdminUser()
    if (user?.role !== 'superadmin') {
      return <Navigate to="/admin/asistencia" replace />
    }
  }

  return children
}
