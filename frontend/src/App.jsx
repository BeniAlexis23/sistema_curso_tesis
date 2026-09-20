import { Navigate, Route, Routes, useParams } from "react-router-dom";
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
import AdminAttendancePage from "./pages/AdminAttendancePage";
import RegistrationAttendancePage from "./pages/RegistrationAttendancePage";
import RegistrationAttendanceExportsPage from "./pages/RegistrationAttendanceExportsPage";
import StaffAttendancePage from "./pages/StaffAttendancePage";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";

function LegacyStudentAttendanceRedirect() {
  const { id } = useParams();
  return <Navigate replace to={`/admin/asistencias/sesiones/${id}/estudiantes`} />;
}

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
        path="/admin/asistencias"
        element={
          <ProtectedAdminRoute permission="attendance.view">
            <AdminAttendancePage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/asistencias/sesiones/:id/estudiantes"
        element={
          <ProtectedAdminRoute permission="registration_attendance.view">
            <RegistrationAttendancePage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/asistencias/sesiones/:id/tesistas"
        element={
          <ProtectedAdminRoute permission="registration_attendance.view">
            <LegacyStudentAttendanceRedirect />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/asistencias/fichas"
        element={
          <ProtectedAdminRoute permission="registration_attendance.export">
            <RegistrationAttendanceExportsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/asistencia-personal"
        element={
          <ProtectedAdminRoute permission="staff_attendance.view">
            <StaffAttendancePage />
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
