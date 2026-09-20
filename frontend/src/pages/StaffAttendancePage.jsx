import { Download, FileSpreadsheet, FileText, LogIn, LogOut, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, downloadStaffAttendance, getAdminSession, getStaffAttendance,
  hasAdminPermission, markStaffCheckIn, markStaffCheckOut,
  updateStaffAttendance,
} from '../services/adminService'

const statusLabels = { pending: 'Pendiente de entrada', checked_in: 'Salida pendiente', completed: 'Asistencia completada' }
const dateLabel = value => value ? `${String(value).slice(8, 10)}/${String(value).slice(5, 7)}/${String(value).slice(0, 4)}` : '—'
const timeLabel = value => value ? String(value).slice(11, 16) : '—'
const modalityLabel = value => value === 'in_person' ? 'Presencial' : 'Síncrona'
const inputDateTime = value => value ? String(value).replace(' ', 'T').slice(0, 16) : ''

export default function StaffAttendancePage() {
  const navigate = useNavigate()
  const session = getAdminSession()
  const canMark = Number(session?.role?.id) !== 1 && hasAdminPermission('staff_attendance.mark')
  const canExport = hasAdminPermission('staff_attendance.export')
  const [rows, setRows] = useState([])
  const [personnelRows, setPersonnelRows] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [exporting, setExporting] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const response = await getStaffAttendance()
      setRows(response.data.rows)
      setPersonnelRows(response.data.personnelRows || [])
      setCanManage(Boolean(response.data.canManage))
    }
    catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }) }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const modules = useMemo(() => {
    const grouped = new Map()
    rows.forEach(row => {
      if (!grouped.has(row.module_number)) grouped.set(row.module_number, { number: row.module_number, name: row.module_name, sessions: [] })
      grouped.get(row.module_number).sessions.push(row)
    })
    return [...grouped.values()]
  }, [rows])

  const mark = async (row, type) => {
    const key = `${type}-${row.session_id}`
    setWorking(key)
    try {
      const response = type === 'in' ? await markStaffCheckIn(row.session_id) : await markStaffCheckOut(row.session_id)
      await load()
      Swal.fire({ icon: 'success', title: response.message, timer: 1500, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo registrar', error.message, 'error') }
    finally { setWorking('') }
  }

  const exportReport = async format => {
    setExporting(format)
    try { await downloadStaffAttendance(format) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  const editAttendance = async row => {
    const result = await Swal.fire({
      title: 'Editar marcación',
      text: `${row.role_name}: ${row.last_names}, ${row.name} · Módulo ${row.module_number}, sesión ${row.session_number}`,
      html: `<label class="swal2-label" for="staff-check-in">Entrada</label><input id="staff-check-in" class="swal2-input" type="datetime-local" value="${inputDateTime(row.check_in_at)}"><label class="swal2-label" for="staff-check-out">Salida opcional</label><input id="staff-check-out" class="swal2-input" type="datetime-local" value="${inputDateTime(row.check_out_at)}">`,
      showCancelButton: true,
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const checkInAt = document.getElementById('staff-check-in').value
        const checkOutAt = document.getElementById('staff-check-out').value
        if (!checkInAt) { Swal.showValidationMessage('La hora de entrada es obligatoria'); return false }
        return { checkInAt, checkOutAt }
      },
    })
    if (!result.isConfirmed) return
    try {
      const response = await updateStaffAttendance(row.attendance_id, result.value)
      await load()
      Swal.fire({ icon: 'success', title: response.message, timer: 1500, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo actualizar', error.message, 'error') }
  }

  return <AdminLayout><main className="mx-auto max-w-[1320px] p-5 lg:p-10">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-display text-3xl font-extrabold text-undc-navy lg:text-4xl">Asistencia del personal</h1><p className="mt-1 text-sm font-semibold text-slate-500"><span className="mr-2 text-xs font-extrabold uppercase tracking-wider text-cyan-600">Usuario</span>{session?.name} {session?.lastNames}</p></div>
      {canExport && <div className="flex gap-2"><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 font-bold text-white" disabled={Boolean(exporting)} onClick={() => exportReport('pdf')}><FileText size={17} />{exporting === 'pdf' ? 'Generando…' : 'PDF'}<Download size={15} /></button><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 font-bold text-white" disabled={Boolean(exporting)} onClick={() => exportReport('excel')}><FileSpreadsheet size={17} />{exporting === 'excel' ? 'Generando…' : 'Excel'}<Download size={15} /></button></div>}
    </div>
    {loading ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-500">Cargando sesiones…</div> : modules.map(module => <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" key={module.number}>
      <header className="border-b border-slate-200 bg-slate-50 px-5 py-5"><p className="text-xs font-extrabold uppercase tracking-wider text-cyan-600">Módulo {module.number}</p><h2 className="mt-1 text-xl font-extrabold text-undc-navy">{module.name}</h2></header>
      <div className="overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Sesión y tema</th><th className="px-4 py-4">Fecha y modalidad</th><th className="px-4 py-4">Entrada</th><th className="px-4 py-4">Salida</th><th className="px-4 py-4">Estado</th><th className="px-5 py-4 text-right">Acción</th></tr></thead><tbody>{module.sessions.map(row => <tr className="border-t border-slate-100" key={row.session_id}><td className="max-w-md px-5 py-4"><strong className="block text-undc-navy">Sesión {row.session_number}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{row.topic}</span></td><td className="px-4 py-4"><strong className="block text-undc-navy">{dateLabel(row.scheduled_start)}</strong><span className="text-xs text-slate-500">{timeLabel(row.scheduled_start)}–{timeLabel(row.scheduled_end)} · {modalityLabel(row.modality)}</span></td><td className="px-4 py-4 font-bold text-undc-navy">{timeLabel(row.check_in_at)}</td><td className="px-4 py-4 font-bold text-undc-navy">{timeLabel(row.check_out_at)}</td><td className="px-4 py-4"><span className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase ${row.attendance_status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{statusLabels[row.attendance_status]}</span></td><td className="px-5 py-4 text-right">{canMark && row.attendance_status === 'pending' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 font-bold text-white" disabled={Boolean(working)} onClick={() => mark(row, 'in')}><LogIn size={17} />{working === `in-${row.session_id}` ? 'Registrando…' : 'Entrada'}</button>}{canMark && row.attendance_status === 'checked_in' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-undc-blue px-4 font-bold text-white" disabled={Boolean(working)} onClick={() => mark(row, 'out')}><LogOut size={17} />{working === `out-${row.session_id}` ? 'Registrando…' : 'Salida'}</button>}{row.attendance_status === 'completed' && <span className="text-xs font-semibold text-slate-400">Registrada</span>}</td></tr>)}</tbody></table></div>
    </section>)}
    {canManage && <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 bg-slate-50 px-5 py-5"><p className="text-xs font-extrabold uppercase tracking-wider text-cyan-600">Administración</p><h2 className="mt-1 text-xl font-extrabold text-undc-navy">Marcaciones del personal</h2><p className="mt-1 text-sm text-slate-500">Puedes corregir las horas que el personal ya registró.</p></header>
      <div className="overflow-x-auto"><table className="min-w-[980px] w-full text-left text-sm"><thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4">Personal</th><th className="px-4 py-4">Cargo</th><th className="px-4 py-4">Módulo y sesión</th><th className="px-4 py-4">Fecha</th><th className="px-4 py-4">Entrada</th><th className="px-4 py-4">Salida</th><th className="px-5 py-4 text-right">Acción</th></tr></thead><tbody>{personnelRows.filter(row => row.attendance_id).map(row => <tr className="border-t border-slate-100" key={row.attendance_id}><td className="px-5 py-4 font-bold text-undc-navy">{row.last_names}, {row.name}</td><td className="px-4 py-4 text-slate-600">{row.role_name}</td><td className="px-4 py-4">{row.module_name} · Sesión {row.session_number}</td><td className="px-4 py-4">{dateLabel(row.scheduled_start)}</td><td className="px-4 py-4 font-bold">{timeLabel(row.check_in_at)}</td><td className="px-4 py-4 font-bold">{timeLabel(row.check_out_at)}</td><td className="px-5 py-4 text-right"><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-50 px-3 font-bold text-undc-blue" onClick={() => editAttendance(row)}><Pencil size={16} />Editar</button></td></tr>)}</tbody></table>{!personnelRows.some(row => row.attendance_id) && <p className="p-8 text-center text-sm text-slate-500">Todavía no hay marcaciones del personal.</p>}</div>
    </section>}
  </main></AdminLayout>
}
