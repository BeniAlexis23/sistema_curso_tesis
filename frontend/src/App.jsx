import { Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import InformationPage from './pages/InformationPage'
import RegistrationPage from './pages/RegistrationPage'
import RegistrationCompletePage from './pages/RegistrationCompletePage'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
import ProtectedAdminRoute from './components/ProtectedAdminRoute'

export default function App() {
  return <Routes><Route path="/" element={<HomePage />} /><Route path="/informacion" element={<InformationPage />} /><Route path="/formulario" element={<RegistrationPage />} /><Route path="/inscripcion-completa" element={<RegistrationCompletePage />} /><Route path="/admin/login" element={<AdminLoginPage />} /><Route path="/admin" element={<ProtectedAdminRoute><AdminDashboardPage /></ProtectedAdminRoute>} /><Route path="*" element={<HomePage />} /></Routes>
}
