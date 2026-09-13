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
import AdminRolesPage from "./pages/AdminRolesPage";
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
          <ProtectedAdminRoute permission="registrations.view">
            <AdminDashboardPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/usuarios"
        element={
          <ProtectedAdminRoute permission="users.view">
            <AdminUsersPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <ProtectedAdminRoute permission="roles.view">
            <AdminRolesPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/pagos"
        element={
          <ProtectedAdminRoute permission="payments.view">
            <AdminPaymentsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/reportes"
        element={
          <ProtectedAdminRoute permission="reports.view">
            <AdminReportsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}
