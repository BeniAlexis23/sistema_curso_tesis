import { CalendarCheck, CheckCircle2, Clock3, UserCheck } from 'lucide-react'
import AdminLayout from '../components/AdminLayout'
import { getAdminUser } from '../services/adminService'

export default function AdminAttendancePage() {
  const user = getAdminUser()
  const isSuper = user?.role === 'superadmin'

  return (
    <AdminLayout>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="section-kicker">GESTIÓN ACADÉMICA · 2026</span>
            <h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">
              Control de Asistencia
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Registro y seguimiento de asistencia de los participantes del curso.
            </p>
          </div>
        </div>

        <section className="my-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <UserCheck className="text-undc-blue" />
            <small className="mt-3 block text-xs font-bold text-slate-400">USUARIO EN SESIÓN</small>
            <b className="font-display text-xl text-undc-navy truncate block">{user?.name || 'Administrador'}</b>
            <span className="text-xs text-slate-500">{user?.email}</span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <CalendarCheck className="text-undc-cyan" />
            <small className="mt-3 block text-xs font-bold text-slate-400">ROL ASIGNADO</small>
            <b className="font-display text-2xl text-undc-navy">
              {isSuper ? 'Superadmin' : 'Admin'}
            </b>
            <span className="text-xs text-slate-500">
              {isSuper ? 'Acceso a todos los módulos' : 'Módulo exclusivo asignado'}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <CheckCircle2 className="text-emerald-600" />
            <small className="mt-3 block text-xs font-bold text-slate-400">ESTADO DEL MÓDULO</small>
            <b className="font-display text-2xl text-undc-navy">Operativo</b>
            <span className="text-xs text-slate-500">Sesión activa y sincronizada</span>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 text-undc-blue">
              <Clock3 size={24} />
              <h2 className="font-display text-xl font-bold text-undc-navy">
                Módulo de Asistencia — Curso Taller de Investigación Aplicada
              </h2>
            </div>
            <p className="mt-3 text-slate-600 leading-relaxed text-sm">
              Bienvenido al módulo de asistencia. Desde este panel se llevará el control de asistencia
              y puntualidad de los alumnos inscritos para las clases semipresenciales de los domingos.
            </p>
            <div className="mt-6 rounded-lg bg-blue-50/70 border border-blue-100 p-4 text-sm text-slate-700">
              <b className="text-undc-blue block mb-1">Información de permisos:</b>
              {isSuper ? (
                <span>
                  Has iniciado sesión como <strong>Superadministrador</strong>. Tienes acceso completo a Inscripciones, Pagos, Reportes, Usuarios y este módulo de Asistencia.
                </span>
              ) : (
                <span>
                  Has iniciado sesión con el rol de <strong>Admin</strong>. Tu cuenta cuenta con acceso exclusivo a este módulo de asistencia para el registro académico correspondiente.
                </span>
              )}
            </div>
          </div>
        </section>
      </main>
    </AdminLayout>
  )
}
