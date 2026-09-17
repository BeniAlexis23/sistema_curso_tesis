import {
  BadgeCheck, ClipboardList, Clock3, Download, FileSpreadsheet, FileText,
  LogIn, LogOut, Pencil, UserRoundCheck, X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  assignAttendanceTeacher, clearAdminToken,
  downloadAttendanceReport, getAdminSession, getAttendance, hasAdminPermission,
  markTeacherCheckIn, markTeacherCheckOut, updateAttendanceConformity,
  updateAttendanceSession, updateTeacherAttendance,
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
  const canViewRegistrationAttendance = hasAdminPermission('registration_attendance.view')
  const canExport = hasAdminPermission('attendance.export')
  const canApprove = hasAdminPermission('attendance.approve')
  const [rows, setRows] = useState([])
  const [teachers, setTeachers] = useState([])
  const [canManage, setCanManage] = useState(false)
  const [currentTime, setCurrentTime] = useState('')
  const [conformityAt, setConformityAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [exporting, setExporting] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [assignment, setAssignment] = useState(null)
  const [sessionForm, setSessionForm] = useState(null)
  const [attendanceForm, setAttendanceForm] = useState(null)
  const isAssignedTeacher = canMark && rows.some(row => Number(row.teacher_id) === Number(session?.id))
  const teacherName = session?.role?.name === 'Docente' || isAssignedTeacher
    ? [session?.name, session?.lastNames].filter(Boolean).join(' ').trim()
    : ''

  const load = async () => {
    setLoading(true)
    try {
      const response = await getAttendance()
      setRows(response.data.rows)
      setTeachers(response.data.teachers)
      setCanManage(Boolean(response.data.canManage))
      setCurrentTime(response.data.currentTime)
      setConformityAt(response.data.conformityAt || null)
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
    const hasAttendance = Boolean(sessionForm.session.attendance_id)
      || Boolean(Number(sessionForm.session.has_student_attendance))
    if (hasAttendance) {
      const confirmation = await Swal.fire({
        title: '¿Actualizar esta sesión?',
        text: 'La sesión ya tiene asistencias registradas. Estas se conservarán sin cambios.',
        icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Actualizar sesión', cancelButtonText: 'Cancelar',
      })
      if (!confirmation.isConfirmed) return
    }
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

  const toggleConformity = async () => {
    const enabled = !conformityAt
    const confirmation = await Swal.fire({
      title: enabled ? '¿Dar conformidad a las asistencias?' : '¿Retirar la conformidad?',
      text: enabled
        ? 'Los PDF mostrarán la conformidad del decano con la fecha de registro.'
        : 'Los PDF dejarán de mostrar la conformidad hasta que vuelva a activarse.',
      icon: enabled ? 'question' : 'warning',
      showCancelButton: true,
      confirmButtonText: enabled ? 'Dar conformidad' : 'Retirar conformidad',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: enabled ? '#16835a' : '#b45309',
    })
    if (!confirmation.isConfirmed) return
    setWorking('conformity')
    try {
      const response = await updateAttendanceConformity(enabled)
      setConformityAt(response.data.conformityAt || null)
      Swal.fire({
        title: enabled ? 'Conformidad activada' : 'Conformidad retirada',
        icon: 'success', timer: 1500, showConfirmButton: false,
      })
    } catch (error) { Swal.fire('No se pudo actualizar', error.message, 'error') }
    finally { setWorking('') }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div><h1 className="font-display text-3xl font-extrabold text-undc-navy lg:text-4xl">Asistencias</h1>{teacherName
          ? <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-sm"><span className="text-xs font-extrabold uppercase tracking-wider text-undc-cyan">Docente</span><b className="font-display text-base text-undc-navy">{teacherName}</b></p>
          : <p className="mt-1 text-sm text-slate-500">Entrada, salida y estudiantes por sesión.</p>}</div>
        {(canManage || canExport || canApprove) && <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {canManage && <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700" value={moduleFilter} onChange={event => setModuleFilter(event.target.value)}><option value="">Todos los módulos</option>{modules.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select>}
          {canApprove && <button
            type="button"
            role="switch"
            aria-checked={Boolean(conformityAt)}
            title={conformityAt ? 'Los PDF incluyen la conformidad del decano' : 'Los PDF todavía no incluyen la conformidad del decano'}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-left text-sm font-bold transition-colors disabled:opacity-60 ${conformityAt ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-700'}`}
            disabled={working === 'conformity'}
            onClick={toggleConformity}
          ><BadgeCheck size={18} /><span className="leading-tight"><span className="block text-[10px] font-extrabold uppercase tracking-wide">Conformidad PDF</span><span className="block">{working === 'conformity' ? 'Actualizando…' : conformityAt ? 'Activa' : 'Pendiente'}</span></span></button>}
          {canExport && <><button className="report-export report-export-pdf" disabled={Boolean(exporting)} onClick={() => exportFile('pdf')}><FileText size={17} />{exporting === 'pdf' ? 'Generando…' : 'PDF'}<Download size={14} /></button><button className="report-export report-export-excel" disabled={Boolean(exporting)} onClick={() => exportFile('excel')}><FileSpreadsheet size={17} />{exporting === 'excel' ? 'Generando…' : 'Excel'}<Download size={14} /></button></>}
        </div>}
      </div>

      {loading && <section className="mt-7 rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">Cargando asistencias…</section>}
      {!loading && !visibleModules.length && <section className="mt-7 rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">No hay sesiones disponibles.</section>}

      <div className="mt-7 space-y-6">{!loading && visibleModules.map(module => <section key={module.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col justify-between gap-4 border-b border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center">
          <div><span className="text-xs font-extrabold uppercase tracking-wider text-undc-cyan">Módulo {module.number}</span><h2 className="font-display mt-1 text-xl font-extrabold text-undc-navy">{module.name}</h2>{canManage && <p className="mt-1 text-sm text-slate-500">Docente: <b className="text-slate-700">{module.teacherName || 'Sin asignar'}</b></p>}</div>
          {canManage && <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white" onClick={() => setAssignment({ module, teacherId: module.teacherId ? String(module.teacherId) : '' })}><UserRoundCheck size={17} />Asignar docente</button>}
        </header>
        <div className="overflow-x-auto"><table className={`w-full table-fixed text-left text-sm ${canManage ? 'min-w-[1000px]' : 'min-w-[860px]'}`}><colgroup><col className="w-[30%]" /><col className="w-[16%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[13%]" /><col className="w-[25%]" /></colgroup><thead className="bg-white text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Sesión y tema</th><th className="p-4">Fecha y modalidad</th><th className="p-4">Entrada</th><th className="p-4">Salida</th><th className="p-4">Estado</th><th className="p-4 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{module.sessions.map(row => {
          const isOwn = Number(row.teacher_id) === Number(session?.id)
          return <tr key={row.session_id}>
            <td className="p-4 align-top"><b className="block text-undc-navy">Sesión {row.session_number}</b><p className="mt-1 whitespace-pre-line break-words text-xs leading-5 text-slate-500">{row.topic || 'Sin tema registrado'}</p></td>
            <td className="p-4 align-middle"><b className="block text-slate-700">{dateLabel(row.scheduled_start)}</b><small className="mt-1 block text-slate-500">{timeLabel(row.scheduled_start)}–{timeLabel(row.scheduled_end)} · {modalityLabels[row.modality]}</small></td>
            <td className="p-4 align-middle font-semibold text-slate-700">{timeLabel(row.check_in_at)}</td>
            <td className="p-4 align-middle font-semibold text-slate-700">{timeLabel(row.check_out_at)}</td>
            <td className="p-4 align-middle"><span className={`status ${row.attendance_status === 'completed' ? 'approved' : 'pending'}`}>{statusLabels[row.attendance_status]}</span></td>
            <td className="p-4 align-middle"><div className="flex justify-end gap-2">
              {canMark && isOwn && row.attendance_status === 'pending' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3 font-bold text-white disabled:opacity-60" disabled={working === `in-${row.session_id}`} onClick={() => mark(row, 'in')}><LogIn size={16} />Entrada</button>}
              {canMark && isOwn && row.attendance_status === 'checked_in' && <button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-undc-blue px-3 font-bold text-white disabled:opacity-60" disabled={working === `out-${row.session_id}`} onClick={() => mark(row, 'out')}><LogOut size={16} />Salida</button>}
              {canViewRegistrationAttendance && (canManage || isOwn) && <button aria-label={`Asistencia de estudiantes de la sesión ${row.session_number}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-cyan-100 bg-cyan-50 px-3 font-bold text-undc-blue" onClick={() => navigate(`/admin/asistencias/sesiones/${row.session_id}/estudiantes`)}><ClipboardList size={16} />Asistencia</button>}
              {canManage && <button aria-label={`Editar sesión ${row.session_number}`} className="grid size-10 place-items-center rounded-lg bg-blue-50 text-undc-blue" onClick={() => openSessionEditor(row)}><Pencil size={16} /></button>}
              {canManage && row.teacher_id && (row.attendance_id || row.scheduled_start <= currentTime) && <button aria-label={`Editar marcación de la sesión ${row.session_number}`} className="grid size-10 place-items-center rounded-lg bg-amber-50 text-amber-700" onClick={() => openAttendanceEditor(row)}><Clock3 size={16} /></button>}
            </div></td>
          </tr>
        })}</tbody></table></div>
      </section>)}</div>
    </main>

    {assignment && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setAssignment(null)}><form className="review-panel" onSubmit={saveAssignment}><header><div><span className="section-kicker">ASIGNACIÓN DEL MÓDULO</span><h2>{assignment.module.name}</h2><p>El cambio se aplicará a sesiones futuras sin marcación.</p></div><button type="button" aria-label="Cerrar" onClick={() => setAssignment(null)}><X /></button></header><div className="review-body"><label><span className="mb-2 block text-sm font-bold text-slate-700">Docente responsable</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={assignment.teacherId} onChange={event => setAssignment({ ...assignment, teacherId: event.target.value })}><option value="">Pendiente de asignación</option>{teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{fullName(teacher)} · {teacher.email}</option>)}</select></label><div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">Las asistencias ya registradas conservarán al docente original. Solo se actualizarán sesiones pendientes que todavía no hayan iniciado.</div></div><footer><span>Acciones de asignación</span><div><button type="button" className="observe" onClick={() => setAssignment(null)}>Cancelar</button><button className="approve" disabled={working === 'assignment'}>{working === 'assignment' ? 'Guardando…' : 'Guardar asignación'}</button></div></footer></form></div>}

    {sessionForm && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setSessionForm(null)}><form className="review-panel" onSubmit={saveSession}><header><div><span className="section-kicker">CONFIGURACIÓN ACADÉMICA</span><h2>Editar sesión {sessionForm.session.session_number}</h2><p>{sessionForm.session.module_name}</p></div><button type="button" aria-label="Cerrar" onClick={() => setSessionForm(null)}><X /></button></header><div className="review-body"><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Tema *</span><textarea className="min-h-24 w-full rounded-lg border border-slate-300 p-3 outline-none focus:border-undc-cyan" maxLength="500" value={sessionForm.topic} onChange={event => setSessionForm({ ...sessionForm, topic: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Modalidad *</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={sessionForm.modality} onChange={event => setSessionForm({ ...sessionForm, modality: event.target.value })}><option value="in_person">Presencial</option><option value="synchronous">Síncrona</option></select></label><span /><label><span className="mb-2 block text-sm font-bold text-slate-700">Inicio *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.scheduledStart} onChange={event => setSessionForm({ ...sessionForm, scheduledStart: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Fin *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.scheduledEnd} onChange={event => setSessionForm({ ...sessionForm, scheduledEnd: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Apertura anticipada (min.)</span><input type="number" min="0" max="720" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={sessionForm.checkInOpensMinutes} onChange={event => setSessionForm({ ...sessionForm, checkInOpensMinutes: Number(event.target.value) })} required /></label></div></div><footer><span>Acciones de la sesión</span><div><button type="button" className="observe" onClick={() => setSessionForm(null)}>Cancelar</button><button className="approve" disabled={working === 'session'}>{working === 'session' ? 'Guardando…' : 'Guardar sesión'}</button></div></footer></form></div>}

    {attendanceForm && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setAttendanceForm(null)}><form className="review-panel" onSubmit={saveAttendance}><header><div><span className="section-kicker">EDITAR MARCACIÓN</span><h2>Sesión {attendanceForm.session.session_number}</h2><p>{attendanceForm.session.module_name} · {`${attendanceForm.session.teacher_name || ''} ${attendanceForm.session.teacher_last_names || ''}`.trim()}</p></div><button type="button" aria-label="Cerrar" onClick={() => setAttendanceForm(null)}><X /></button></header><div className="review-body"><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-bold text-slate-700">Entrada *</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={attendanceForm.checkInAt} onChange={event => setAttendanceForm({ ...attendanceForm, checkInAt: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Salida</span><input type="datetime-local" className="min-h-12 w-full rounded-lg border border-slate-300 px-3" value={attendanceForm.checkOutAt} onChange={event => setAttendanceForm({ ...attendanceForm, checkOutAt: event.target.value })} /></label></div></div><footer><span>Acciones de la marcación</span><div><button type="button" className="observe" onClick={() => setAttendanceForm(null)}>Cancelar</button><button className="approve" disabled={working === 'attendance'}>{working === 'attendance' ? 'Guardando…' : 'Guardar marcación'}</button></div></footer></form></div>}
  </AdminLayout>
}
