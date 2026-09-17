import { Download, Eye, FileSpreadsheet, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, downloadAllRegistrationAttendance, downloadRegistrationAttendance,
  listRegistrationAttendanceSessions,
} from '../services/adminService'

const dateLabel = value => value ? `${String(value).slice(8, 10)}/${String(value).slice(5, 7)}/${String(value).slice(0, 4)}` : '—'

export default function RegistrationAttendanceExportsPage() {
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')

  const load = async () => {
    setLoading(true)
    try { setSessions((await listRegistrationAttendanceSessions()).data) }
    catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }) }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const exportFile = async (sessionId, format) => {
    setExporting(`${sessionId}-${format}`)
    try { await downloadRegistrationAttendance(sessionId, format) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  const exportAll = async format => {
    setExporting(`all-${format}`)
    try { await downloadAllRegistrationAttendance(format) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  const hasStudents = sessions.some(item => Number(item.student_count) > 0)

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-3xl font-extrabold text-undc-navy lg:text-4xl">Asistencia de estudiantes</h1><p className="mt-1 text-sm text-slate-500">Asistencia guardada por sesión.</p></div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={!hasStudents || Boolean(exporting)} onClick={() => exportAll('pdf')}><FileText size={18} />Todo en PDF<Download size={15} /></button>
          <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={!hasStudents || Boolean(exporting)} onClick={() => exportAll('excel')}><FileSpreadsheet size={18} />Todo en Excel<Download size={15} /></button>
          <button className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-undc-blue" onClick={load}>Actualizar</button>
        </div>
      </div>
      <section className="mt-7 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-10 text-center text-slate-500">Cargando asistencias…</p> : !sessions.length ? <p className="p-10 text-center text-slate-500">No hay sesiones disponibles.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Módulo y sesión</th><th className="p-4">Fecha</th><th className="p-4">Docente</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{sessions.map(item => {
              const complete = Number(item.student_count) > 0 && Number(item.saved_count) === Number(item.student_count)
              return <tr key={item.session_id}>
                <td className="p-4"><b className="block text-undc-navy">{item.module_name} · Sesión {item.session_number}</b><small className="mt-1 block text-slate-500">{item.course_name}</small></td>
                <td className="p-4 font-semibold text-slate-700">{dateLabel(item.scheduled_start)}</td>
                <td className="p-4 text-slate-700">{[item.teacher_name, item.teacher_last_names].filter(Boolean).join(' ') || 'Sin asignar'}</td>
                <td className="p-4"><span className={`status ${complete ? 'approved' : 'pending'}`}>{complete ? 'Guardada' : 'Pendiente'}</span></td>
                <td className="p-4"><div className="flex justify-end gap-2">
                  <button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-100 bg-cyan-50 px-3 font-bold text-undc-blue" onClick={() => navigate(`/admin/asistencias/sesiones/${item.session_id}/estudiantes`)}><Eye size={16} />Ver</button>
                  <button aria-label={`Exportar PDF de la sesión ${item.session_number} del módulo ${item.module_number}`} className="grid size-10 place-items-center rounded-lg bg-red-50 text-red-700 disabled:opacity-40" disabled={!complete || Boolean(exporting)} onClick={() => exportFile(item.session_id, 'pdf')}><FileText size={17} /><Download size={12} /></button>
                  <button aria-label={`Exportar Excel de la sesión ${item.session_number} del módulo ${item.module_number}`} className="grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700 disabled:opacity-40" disabled={!complete || Boolean(exporting)} onClick={() => exportFile(item.session_id, 'excel')}><FileSpreadsheet size={17} /><Download size={12} /></button>
                </div></td>
              </tr>
            })}</tbody>
          </table></div>}
      </section>
    </main>
  </AdminLayout>
}
