import { Navigate } from 'react-router-dom'
import { getAdminToken } from '../services/adminService'

export default function ProtectedAdminRoute({ children }) {
  return getAdminToken() ? children : <Navigate to="/admin/login" replace />
}
