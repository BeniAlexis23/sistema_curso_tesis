import { Navigate } from 'react-router-dom'
import { getAdminHomePath, getAdminToken, hasAdminPermission } from '../services/adminService'

export default function ProtectedAdminRoute({ children, permission }) {
  if (!getAdminToken()) return <Navigate to="/admin/login" replace />
  if (permission && !hasAdminPermission(permission)) return <Navigate to={getAdminHomePath()} replace />
  return children
}
