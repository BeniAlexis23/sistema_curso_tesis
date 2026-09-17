import { ArrowLeft, Download, FileSpreadsheet, FileText, RefreshCw, Save, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, downloadRegistrationAttendance, getRegistrationAttendance,
  hasAdminPermission, saveRegistrationAttendance,
} from '../services/adminService'

const dateLabel = value => value ? `${String(value).slice(8, 10)}/${String(value).slice(5, 7)}/${String(value).slice(0, 4)}` : '—'

export default function RegistrationAttendancePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const canExport = hasAdminPermission('registration_attendance.export')
  const backPath = canExport && !hasAdminPermission('attendance.mark') && !hasAdminPermission('attendance.manage')
    ? '/admin/asistencias/fichas' : '/admin/asistencias'
  const [session, setSession] = useState(null)
  const [students, setStudents] = useState([])
  const [marks, setMarks] = useState({})
  const [canMark, setCanMark] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await getRegistrationAttendance(id)
      setSession(response.data.session)
      setStudents(response.data.students)
      setCanMark(Boolean(response.data.canMark) && hasAdminPermission('registration_attendance.mark'))
      setMarks(Object.fromEntries(response.data.students.map(student => [student.registration_id, student.attendance_status || ''])))
    } catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }); return }
      setErrorMessage(error.message)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const present = students.filter(student => marks[student.registration_id] === 'present').length
  const absent = students.filter(student => marks[student.registration_id] === 'absent').length
  const unmarked = students.length - present - absent
  const changed = students.some(student => marks[student.registration_id] !== (student.attendance_status || ''))
  const savedComplete = students.length > 0
    && students.every(student => ['present', 'absent'].includes(student.attendance_status))
    && !changed

  const exportFile = async format => {
    if (!savedComplete || exporting) return
    setExporting(format)
    try { await downloadRegistrationAttendance(id, format) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  const markPendingPresent = () => setMarks(previous => Object.fromEntries(students.map(student => [
    student.registration_id, previous[student.registration_id] || 'present',
  ])))

  const refresh = async () => {
    if (changed) {
      const confirmation = await Swal.fire({
        title: '¿Actualizar la lista?', text: 'Se perderán las marcas que todavía no guardaste.',
        icon: 'question', showCancelButton: true, confirmButtonText: 'Actualizar', cancelButtonText: 'Cancelar',
      })
      if (!confirmation.isConfirmed) return
    }
    await load()
  }

  const save = async () => {
    if (!canMark || !students.length || unmarked || !changed || saving) return
    setSaving(true)
    try {
      await saveRegistrationAttendance(id, students.map(student => ({
        registrationId: Number(student.registration_id), status: marks[student.registration_id],
      })))
      await load()
      Swal.fire({ title: 'Asistencia guardada', icon: 'success', timer: 1400, showConfirmButton: false })
    } catch (error) {
      Swal.fire('No se pudo guardar', error.message, 'error')
    } finally { setSaving(false) }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[960px] py-8 lg:py-10">
      <button className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-undc-blue" onClick={() => navigate(backPath)}><ArrowLeft size={18} />Volver</button>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-extrabold text-undc-navy lg:text-4xl">Asistencia de estudiantes</h1>
          {session && <p className="mt-1 text-sm text-slate-500">{session.module_name} · Sesión {session.session_number} · {dateLabel(session.scheduled_start)}</p>}
          {session && <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="text-xs font-extrabold uppercase tracking-wider text-undc-cyan">Tema de la sesión</span>
            <p className="mt-1 whitespace-pre-line break-words text-sm leading-6 text-slate-700">{session.topic || 'Sin tema registrado'}</p>
          </div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 disabled:opacity-60" disabled={loading || saving} onClick={refresh}><RefreshCw size={17} />Actualizar</button>
          {canExport && <><button className="report-export report-export-pdf disabled:opacity-50" disabled={loading || saving || Boolean(exporting) || !savedComplete} onClick={() => exportFile('pdf')}><FileText size={17} />PDF<Download size={14} /></button><button className="report-export report-export-excel disabled:opacity-50" disabled={loading || saving || Boolean(exporting) || !savedComplete} onClick={() => exportFile('excel')}><FileSpreadsheet size={17} />Excel<Download size={14} /></button></>}
        </div>
      </div>

      {loading && <section className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">Cargando asistencia…</section>}
      {!loading && errorMessage && <section className="rounded-xl border border-red-200 bg-white p-8 text-center"><p className="text-red-700">{errorMessage}</p><button className="mt-4 min-h-11 rounded-lg bg-undc-blue px-5 font-bold text-white" onClick={load}>Reintentar</button></section>}
      {!loading && !errorMessage && session && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
          <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-undc-navy"><UsersRound size={20} />Lista de estudiantes <span className="text-sm font-semibold text-slate-500">({students.length})</span></h2>
          {canMark && unmarked > 0 && <button type="button" className="min-h-11 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 disabled:opacity-50" disabled={saving} onClick={markPendingPresent}>Marcar pendientes presentes</button>}
        </header>
        {!students.length && <p className="p-10 text-center text-slate-500">No hay estudiantes en esta sesión.</p>}
        {students.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-white text-xs uppercase tracking-wider text-slate-500"><tr><th className="w-16 p-4">N.º</th><th className="p-4">Estudiante</th><th className="p-4 text-right">Asistencia</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.map((student, index) => {
            const mark = marks[student.registration_id]
            return <tr key={student.registration_id} className="even:bg-slate-50/70">
              <td className="p-4 text-slate-500">{index + 1}</td>
              <td className="p-4 font-bold text-undc-navy">{student.last_names}, {student.first_names}</td>
              <td className="p-4 text-right">{canMark ? <select
                aria-label={`Asistencia de ${student.first_names} ${student.last_names}`}
                value={mark || ''}
                disabled={saving}
                onChange={event => setMarks(previous => ({ ...previous, [student.registration_id]: event.target.value }))}
                className="min-h-11 w-full max-w-[170px] rounded-lg border border-slate-300 bg-white px-3 font-semibold text-undc-navy outline-none focus:border-undc-cyan disabled:opacity-60"
              >
                <option value="" disabled>Sin marcar</option>
                <option value="present">Presente</option>
                <option value="absent">Ausente</option>
              </select> : <span className={`status ${mark === 'present' ? 'approved' : 'pending'}`}>{mark === 'present' ? 'Presente' : mark === 'absent' ? 'Ausente' : 'Sin marcar'}</span>}</td>
            </tr>
          })}</tbody>
        </table></div>}
        {canMark && students.length > 0 && <footer className="sticky bottom-0 flex flex-col justify-between gap-3 border-t border-slate-200 bg-undc-navy p-4 sm:flex-row sm:items-center">
          <p className="text-sm text-white">{present} presentes · {absent} ausentes{unmarked ? ` · ${unmarked} por marcar` : changed ? ' · Cambios sin guardar' : ' · Guardado'}</p>
          <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-5 font-bold text-white disabled:opacity-50" disabled={Boolean(unmarked) || !changed || saving} onClick={save}><Save size={17} />{saving ? 'Guardando…' : 'Guardar asistencia'}</button>
        </footer>}
      </section>}
    </main>
  </AdminLayout>
}
