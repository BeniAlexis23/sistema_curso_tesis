import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import InformationPage from "./pages/InformationPage";
import RegistrationPage from "./pages/RegistrationPage";
import RegistrationCompletePage from "./pages/RegistrationCompletePage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminPaymentsPage from "./pages/AdminPaymentsPage";
import AdminReportsPage from "./pages/AdminReportsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AdminAttendancePage from "./pages/AdminAttendancePage";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/informacion" element={<InformationPage />} />
      <Route path="/formulario" element={<RegistrationPage />} />
      <Route
        path="/inscripcion-completa"
        element={<RegistrationCompletePage />}
      />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute requiredRole="superadmin">
            <AdminDashboardPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/pagos"
        element={
          <ProtectedAdminRoute requiredRole="superadmin">
            <AdminPaymentsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/reportes"
        element={
          <ProtectedAdminRoute requiredRole="superadmin">
            <AdminReportsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <ProtectedAdminRoute requiredRole="superadmin">
            <AdminUsersPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/asistencia"
        element={
          <ProtectedAdminRoute>
            <AdminAttendancePage />
          </ProtectedAdminRoute>
        }
      />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
