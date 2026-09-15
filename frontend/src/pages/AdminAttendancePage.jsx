import {
  CalendarCheck, CheckCircle2, Clock3, Download, FileSpreadsheet, FileText,
  LogIn, LogOut, Pencil, UserRoundCheck, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  assignAttendanceTeacher, clearAdminToken,
  downloadAttendanceReport, getAdminSession, getAttendance, hasAdminPermission,
  markTeacherCheckIn, markTeacherCheckOut, updateAttendanceSession, updateTeacherAttendance,
} from '../services/adminService'

const statusLabels = { pending: 'Pendiente de entrada', checked_in: 'Salida pendiente', completed: 'Asistencia completada' }
const modalityLabels = { in_person: 'Presencial', synchronous: 'Síncrona' }
const dateLabel = value => value ? `${String(value).slice(8, 10)}/${String(value).slice(5, 7)}/${String(value).slice(0, 4)}` : '—'
const timeLabel = value => value ? String(value).slice(11, 16) : '—'
const inputDateTime = value => value ? String(value).replace(' ', 'T').slice(0, 16) : ''
const fullName = user => `${user?.name || ''} ${user?.last_names || ''}`.trim()

export default function AdminAttendancePage() {
  const navigate = useNavigate()
  const session = getAdminSession()
  const canMark = hasAdminPermission('attendance.mark')
  const canExport = hasAdminPermission('attendance.export')
  const [rows, setRows] = useState([])
  const [teachers, setTeachers] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [exporting, setExporting] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [assignment, setAssignment] = useState(null)
  const [sessionForm, setSessionForm] = useState(null)
  const [attendanceForm, setAttendanceForm] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const response = await getAttendance()
      setRows(response.data.rows)
      setTeachers(response.data.teachers)
      setCanManage(Boolean(response.data.canManage))
      setCurrentTime(response.data.currentTime)
    } catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }) }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const modules = useMemo(() => {
    const grouped = new Map()
    rows.forEach(row => {
      if (!grouped.has(row.module_id)) grouped.set(row.module_id, {
        id: row.module_id,
        number: row.module_number,
        name: row.module_name,
        teacherId: row.current_teacher_id,
        teacherName: `${row.current_teacher_name || ''} ${row.current_teacher_last_names || ''}`.trim(),
        sessions: [],
      })
      grouped.get(row.module_id).sessions.push(row)
    })
    return [...grouped.values()]
  }, [rows])

  const visibleModules = moduleFilter ? modules.filter(module => String(module.id) === moduleFilter) : modules
  const completed = rows.filter(row => row.attendance_status === 'completed').length
  const openEntries = rows.filter(row => row.attendance_status === 'checked_in').length
  const assignedModules = modules.filter(module => module.teacherId).length

  const saveAssignment = async event => {
    event.preventDefault()
    setWorking('assignment')
    try {
      await assignAttendanceTeacher(assignment.module.id, assignment.teacherId ? Number(assignment.teacherId) : null)
      setAssignment(null)
      await load()
      Swal.fire({ title: 'Asignación actualizada', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo asignar', error.message, 'error') }
    finally { setWorking('') }
  }

  const openSessionEditor = row => setSessionForm({
    session: row,
    topic: row.topic,
    modality: row.modality,
    scheduledStart: inputDateTime(row.scheduled_start),
    scheduledEnd: inputDateTime(row.scheduled_end),
    checkInOpensMinutes: Number(row.check_in_opens_minutes),
  })

  const saveSession = async event => {
    event.preventDefault()
    setWorking('session')
    try {
      await updateAttendanceSession(sessionForm.session.session_id, sessionForm)
      setSessionForm(null)
      await load()
      Swal.fire({ title: 'Sesión actualizada', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo actualizar', error.message, 'error') }
    finally { setWorking('') }
  }

  const openAttendanceEditor = row => setAttendanceForm({
    session: row,
    checkInAt: inputDateTime(row.check_in_at || row.scheduled_start),
    checkOutAt: inputDateTime(row.check_out_at || ''),
  })

  const saveAttendance = async event => {
    event.preventDefault()
    setWorking('attendance')
    try {
      await updateTeacherAttendance(attendanceForm.session.session_id, attendanceForm)
      setAttendanceForm(null)
      await load()
      Swal.fire({ title: 'Marcación actualizada', icon: 'success', timer: 1500, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo actualizar', error.message, 'error') }
    finally { setWorking('') }
  }

  const mark = async (row, type) => {
    const isEntry = type === 'in'
    const confirmation = await Swal.fire({
      title: isEntry ? '¿Registrar entrada ahora?' : '¿Registrar salida ahora?',
      text: 'La hora será tomada directamente por el servidor.',
      icon: 'question', showCancelButton: true,
      confirmButtonText: isEntry ? 'Marcar entrada' : 'Marcar salida', cancelButtonText: 'Cancelar',
      confirmButtonColor: isEntry ? '#16835a' : '#0b4d96',
    })
    if (!confirmation.isConfirmed) return
    setWorking(`${type}-${row.session_id}`)
    try {
      if (isEntry) await markTeacherCheckIn(row.session_id)
      else await markTeacherCheckOut(row.session_id)
      await load()
      Swal.fire({ title: isEntry ? 'Entrada registrada' : 'Salida registrada', icon: 'success', timer: 1400, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo registrar', error.message, 'error') }
    finally { setWorking('') }
  }

  const exportFile = async format => {
    setExporting(format)
    try { await downloadAttendanceReport(format, moduleFilter) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div><span className="section-kicker">CONTROL ACADÉMICO · HORA DEL SERVIDOR</span><h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">Asistencia docente</h1><p className="mt-1 text-sm text-slate-500">Entrada y salida de los docentes responsables de cada módulo.</p></div>
        {canManage && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}><option value="">Todos los módulos</option>{modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select>
          {canExport && <><button className="report-export report-export-pdf" disabled={Boolean(exporting)} onClick={() => exportFile('pdf')}><FileText size={17} />{exporting === 'pdf' ? 'Generando…' : 'PDF'}<Download size={14} /></button><button className="report-export report-export-excel" disabled={Boolean(exporting)} onClick={() => exportFile('excel')}><FileSpreadsheet size={17} />{exporting === 'excel' ? 'Generando…' : 'Excel'}<Download size={14} /></button></>}
        </div>}
      </div>

      <section className="my-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UserRoundCheck className="text-undc-cyan" /><small className="mt-3 block text-xs font-bold text-slate-400">MÓDULOS ASIGNADOS</small><b className="font-display text-2xl text-undc-navy">{assignedModules}/{modules.length || 3}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><CheckCircle2 className="text-emerald-600" /><small className="mt-3 block text-xs font-bold text-slate-400">ASISTENCIAS COMPLETAS</small><b className="font-display text-2xl text-undc-navy">{completed}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><Clock3 className="text-amber-500" /><small className="mt-3 block text-xs font-bold text-slate-400">SALIDAS PENDIENTES</small><b className="font-display text-2xl text-undc-navy">{openEntries}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><CalendarCheck className="text-undc-blue" /><small className="mt-3 block text-xs font-bold text-slate-400">SESIONES PROGRAMADAS</small><b className="font-display text-2xl text-undc-navy">{rows.length}</b></div>
      </section>

      {loading && <section className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">Cargando asistencias…</section>}
      {!loading && !visibleModules.length && <section className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">No tienes sesiones asignadas todavía.</section>}

      <div className="space-y-6">{!loading && visibleModules.map(module => <section key={module.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">
          <div><span className="text-xs font-extrabold uppercase tracking-wider text-undc-cyan">Módulo {module.number}</span><h2 className="font-display mt-1 text-xl font-extrabold text-undc-navy">{module.name}</h2><p className="mt-1 text-sm text-slate-500">Docente actual: <b className="text-slate-700">{module.teacherName || 'Pendiente de asignación'}</b></p></div>
          {canManage && <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white" onClick={() => setAssignment({ module, teacherId: module.teacherId ? String(module.teacherId) : '' })}><UserRoundCheck size={17} />Asignar docente</button>}
        </header>
        <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-white text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Sesión</th><th className="p-4">Fecha y modalidad</th><th className="p-4">Docente</th><th className="p-4">Entrada</th><th className="p-4">Salida</th><th className="p-4">Estado</th><th className="p-4"></th></tr></thead><tbody className="divide-y divide-slate-100">{module.sessions.map(row => {
          const isOwn = Number(row.teacher_id) === Number(session?.id)
          return <tr key={row.session_id}><td className="p-4"><b className="block text-undc-navy">Sesión {row.session_number}</b><small className="mt-1 block max-w-[260px] text-slate-500">{row.topic}</small></td><td className="p-4"><b className="block text-slate-700">{dateLabel(row.scheduled_start)}</b><small className="mt-1 block text-slate-500">{timeLabel(row.scheduled_start)}–{timeLabel(row.scheduled_end)} · {modalityLabels[row.modality]}</small></td><td className="p-4"><b className="block text-slate-700">{`${row.teacher_name || ''} ${row.teacher_last_names || ''}`.trim() || 'Sin asignar'}</b><small className="mt-1 block text-slate-500">{row.teacher_email || '—'}</small></td><td className="p-4 font-semibold text-slate-700">{timeLabel(row.check_in_at)}</td><td className="p-4 font-semibold text-slate-700">{timeLabel(row.check_out_at)}</td><td className="p-4"><span className={`status ${row.attendance_status === 'completed' ? 'approved' : 'pending'}`}>{statusLabels[row.attendance_status]}</span></td><td className="p-4"><div className="flex justify-end gap-2">{canMark && isOwn && row.attendance_status === 'pending' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 font-bold text-white disabled:opacity-60" disabled={working === `in-${row.session_id}`} onClick={() => mark(row, 'in')}><LogIn size={16} />Entrada</button>}{canMark && isOwn && row.attendance_status === 'checked_in' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-undc-blue px-3 font-bold text-white disabled:opacity-60" disabled={working === `out-${row.session_id}`} onClick={() => mark(row, 'out')}><LogOut size={16} />Salida</button>}{canManage && <button aria-label="Editar sesión" className="grid size-10 place-items-center rounded-lg bg-blue-50 text-undc-blue" onClick={() => openSessionEditor(row)}><Pencil size={16} /></button>}{canManage && row.teacher_id && (row.attendance_id || row.scheduled_start <= currentTime) && <button aria-label="Editar marcación" className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700" onClick={() => openAttendanceEditor(row)}><Clock3 size={16} /></button>}</div></td></tr>
        })}</tbody></table></div>
      </section>)}</div>
      <p className="mt-5 text-xs text-slate-400">Hora actual del servidor: {dateLabel(currentTime)} {timeLabel(currentTime)} · Zona horaria de Perú (UTC-5).</p>
    </main>

    {assignment && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setAssignment(null)}><form className="review-panel" onSubmit={saveAssignment}><header><div><span className="section-kicker">ASIGNACIÓN DEL MÓDULO</span><h2>{assignment.module.name}</h2><p>El cambio se aplicará a sesiones futuras sin marcación.</p></div><button type="button" aria-label="Cerrar" onClick={() => setAssignment(null)}><X /></button></header><div className="review-body"><label><span className="mb-2 block text-sm font-bold text-slate-700">Docente responsable</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={assignment.teacherId} onChange={event => setAssignment({ ...assignment, teacherId: event.target.value })}><option value="">Pendiente de asignación</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{fullName(teacher)} · {teacher.email}</option>)}</select></label><div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Las asistencias ya registradas conservarán al docente original. Solo se actualizarán sesiones pendientes que todavía no hayan iniciado.</div></div><footer><span>Acciones de asignación</span><div><button type="button" className="observe" onClick={() => setAssignment(null)}>Cancelar</button><button className="approve" disabled={working === 'assignment'}>{working === 'assignment' ? 'Guardando…' : 'Guardar asignación'}</button></div></footer></form></div>}

    {sessionForm && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setSessionForm(null)}><form className="review-panel" onSubmit={saveSession}><header><div><span className="section-kicker">CONFIGURACIÓN ACADÉMICA</span><h2>Editar sesión {sessionForm.session.session_number}</h2><p>{sessionForm.session.module_name}</p></div><button type="button" aria-label="Cerrar" onClick={() => setSessionForm(null)}><X /></button></header><div className="review-body"><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Tema *</span><textarea className="min-h-24 w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-undc-cyan" maxLength="500" value={sessionForm.topic} onChange={event => setSessionForm({ ...sessionForm, topic: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Modalidad *</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={sessionForm.modality} onChange={event => setSessionForm({ ...sessionForm, modality: event.target.value })}><option value="in_person">Presencial</option><option value="synchronous">Síncrona</option></select></label><span /><label><span className="mb-2 block text-sm font-bold text-slate-700">Inicio *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.scheduledStart} onChange={event => setSessionForm({ ...sessionForm, scheduledStart: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Fin *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.scheduledEnd} onChange={event => setSessionForm({ ...sessionForm, scheduledEnd: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Apertura anticipada (min.)</span><input type="number" min="0" max="720" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.checkInOpensMinutes} onChange={event => setSessionForm({ ...sessionForm, checkInOpensMinutes: Number(event.target.value) })} required /></label></div></div><footer><span>Acciones de la sesión</span><div><button type="button" className="observe" onClick={() => setSessionForm(null)}>Cancelar</button><button className="approve" disabled={working === 'session'}>{working === 'session' ? 'Guardando…' : 'Guardar sesión'}</button></div></footer></form></div>}

    {attendanceForm && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setAttendanceForm(null)}><form className="review-panel" onSubmit={saveAttendance}><header><div><span className="section-kicker">EDITAR MARCACIÓN</span><h2>Sesión {attendanceForm.session.session_number}</h2><p>{attendanceForm.session.module_name} · {`${attendanceForm.session.teacher_name || ''} ${attendanceForm.session.teacher_last_names || ''}`.trim()}</p></div><button type="button" aria-label="Cerrar" onClick={() => setAttendanceForm(null)}><X /></button></header><div className="review-body"><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-bold text-slate-700">Entrada *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={attendanceForm.checkInAt} onChange={event => setAttendanceForm({ ...attendanceForm, checkInAt: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Salida</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={attendanceForm.checkOutAt} onChange={event => setAttendanceForm({ ...attendanceForm, checkOutAt: event.target.value })} /></label></div></div><footer><span>Acciones de la marcación</span><div><button type="button" className="observe" onClick={() => setAttendanceForm(null)}>Cancelar</button><button className="approve" disabled={working === 'attendance'}>{working === 'attendance' ? 'Guardando…' : 'Guardar marcación'}</button></div></footer></form></div>}
  </AdminLayout>
}
