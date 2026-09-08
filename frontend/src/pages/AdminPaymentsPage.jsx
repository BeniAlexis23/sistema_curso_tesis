import { ArrowLeft, CheckCircle2, CreditCard, Edit3, Search, WalletCards, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import { clearAdminToken, listPayments, updatePayment, updateRegistration } from '../services/adminService'

const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))
const date = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PE') : '—'

export default function AdminPaymentsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setRows((await listPayments()).data) }
    catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login') }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const registrations = useMemo(() => {
    const grouped = new Map()
    rows.forEach(row => {
      if (!grouped.has(row.registration_id)) grouped.set(row.registration_id, { ...row, payments: [] })
      grouped.get(row.registration_id).payments.push(row)
    })
    return [...grouped.values()]
  }, [rows])
  const visible = registrations.filter(item => `${item.first_names} ${item.last_names} ${item.dni} ${item.email}`.toLowerCase().includes(search.toLowerCase()))
  const selected = registrations.find(item => item.registration_id === selectedId)
  const totalExpected = rows.reduce((sum, item) => sum + Number(item.amount), 0)
  const totalPaid = rows.filter(item => item.payment_status === 'paid').reduce((sum, item) => sum + Number(item.amount), 0)

  const editParticipant = async event => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try {
      await updateRegistration(selected.registration_id, data)
      await load()
      Swal.fire({ title: 'Datos actualizados', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo actualizar', error.message, 'error') }
  }

  const changePayment = async payment => {
    let payload
    if (payment.payment_status === 'paid') {
      const result = await Swal.fire({ title: '¿Marcar este pago como pendiente?', icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, cambiar', cancelButtonText: 'Cancelar' })
      if (!result.isConfirmed) return
      payload = { status: 'pending', paidAt: null, notes: payment.notes || '' }
    } else {
      const result = await Swal.fire({
        title: 'Registrar pago',
        html: '<label style="display:block;text-align:left;font-size:13px;font-weight:700;margin-bottom:6px">Fecha de pago</label><input id="payment-date" type="date" class="swal2-input" style="width:100%;margin:0 0 16px"><label style="display:block;text-align:left;font-size:13px;font-weight:700;margin-bottom:6px">Observación</label><textarea id="payment-notes" class="swal2-textarea" style="width:100%;margin:0" placeholder="Número de operación u observación (opcional)"></textarea>',
        didOpen: () => { document.getElementById('payment-date').value = new Date().toISOString().slice(0, 10) },
        preConfirm: () => {
          const paidAt = document.getElementById('payment-date').value
          if (!paidAt) return Swal.showValidationMessage('Selecciona la fecha de pago')
          return { status: 'paid', paidAt, notes: document.getElementById('payment-notes').value }
        },
        showCancelButton: true, confirmButtonText: 'Guardar pago', cancelButtonText: 'Cancelar', confirmButtonColor: '#0b4d96',
      })
      if (!result.isConfirmed) return
      payload = result.value
    }
    try { await updatePayment(payment.payment_id, payload); await load(); Swal.fire({ title: 'Pago actualizado', icon: 'success', timer: 1200, showConfirmButton: false }) }
    catch (error) { Swal.fire('Error', error.message, 'error') }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><span className="section-kicker">GESTIÓN ECONÓMICA · 2026</span><h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">Seguimiento de pagos</h1><p className="mt-1 text-sm text-slate-500">Controla cuotas, vencimientos y datos de los participantes.</p></div>
        <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-600" to="/admin"><ArrowLeft size={17} /> Inscripciones</Link>
      </div>
      <section className="my-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><WalletCards className="text-undc-cyan" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL PROGRAMADO</small><b className="font-display text-2xl text-undc-navy">{money(totalExpected)}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><CheckCircle2 className="text-emerald-600" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL PAGADO</small><b className="font-display text-2xl text-undc-navy">{money(totalPaid)}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><CreditCard className="text-amber-500" /><small className="mt-3 block text-xs font-bold text-slate-400">SALDO PENDIENTE</small><b className="font-display text-2xl text-undc-navy">{money(totalExpected - totalPaid)}</b></div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4"><label className="flex max-w-md items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400"><Search size={17} /><input className="w-full border-0 py-3 text-sm text-slate-700 outline-none" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI o correo" /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Participante</th><th className="p-4">Modalidad</th><th className="p-4">Progreso</th><th className="p-4">Pagado</th><th className="p-4">Pendiente</th><th className="p-4"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(item => { const paid = item.payments.filter(p => p.payment_status === 'paid').reduce((s, p) => s + Number(p.amount), 0); const total = item.payments.reduce((s, p) => s + Number(p.amount), 0); return <tr key={item.registration_id}><td className="p-4"><b className="block text-undc-navy">{item.first_names} {item.last_names}</b><small className="text-slate-400">DNI {item.dni}</small></td><td className="p-4">{item.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1'}</td><td className="p-4"><b>{item.payments.filter(p => p.payment_status === 'paid').length}/4 cuotas</b></td><td className="p-4 font-bold text-emerald-700">{money(paid)}</td><td className="p-4 font-bold text-amber-700">{money(total - paid)}</td><td className="p-4"><button className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 font-bold text-undc-blue" onClick={() => setSelectedId(item.registration_id)}><Edit3 size={15} /> Gestionar</button></td></tr> })}</tbody></table>{loading && <p className="p-10 text-center text-slate-500">Cargando pagos…</p>}{!loading && !visible.length && <p className="p-10 text-center text-slate-500">No se encontraron registros.</p>}</div>
      </section>
    </main>
    {selected && <div className="fixed inset-0 z-30 flex justify-end bg-undc-navy/60 backdrop-blur-sm" onMouseDown={e => e.target === e.currentTarget && setSelectedId(null)}><aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl"><header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5"><div><span className="section-kicker">DETALLE DEL PARTICIPANTE</span><h2 className="font-display mt-2 text-2xl font-extrabold text-undc-navy">{selected.first_names} {selected.last_names}</h2></div><button className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-600" onClick={() => setSelectedId(null)}><X /></button></header><div className="space-y-8 p-5">
      <form onSubmit={editParticipant}><h3 className="font-display mb-4 text-lg font-extrabold text-undc-navy">Editar datos</h3><div className="grid gap-4 sm:grid-cols-2">{[['firstNames','Nombres',selected.first_names],['lastNames','Apellidos',selected.last_names],['dni','DNI',selected.dni],['email','Correo',selected.email],['phone','Celular',selected.phone]].map(([name,label,value]) => <label className="grid gap-1.5 text-sm font-bold text-slate-600" key={name}>{label}<input className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal outline-none focus:border-undc-cyan" name={name} defaultValue={value} required /></label>)}<label className="grid gap-1.5 text-sm font-bold text-slate-600">Modalidad de pago<select className="min-h-11 rounded-lg border border-slate-300 px-3 font-normal" name="paymentMode" defaultValue={selected.payment_mode}><option value="option1">Opción 1</option><option value="option2">Opción 2</option></select></label></div><button className="mt-4 rounded-lg bg-undc-blue px-5 py-3 text-sm font-bold text-white" type="submit">Guardar datos</button></form>
      <section><h3 className="font-display mb-4 text-lg font-extrabold text-undc-navy">Cronograma de pagos</h3><div className="space-y-3">{selected.payments.map(payment => <article className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center" key={payment.payment_id}><div><b className="block text-undc-navy">{payment.concept}</b><span className="mt-1 block text-sm text-slate-500">Vence: {date(payment.due_date)} · {money(payment.amount)}</span>{payment.notes && <small className="mt-1 block text-slate-500">{payment.notes}</small>}</div><button className={`min-h-10 rounded-lg px-4 text-sm font-bold ${payment.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`} onClick={() => changePayment(payment)}>{payment.payment_status === 'paid' ? `Pagado · ${date(payment.paid_at)}` : 'Marcar pagado'}</button></article>)}</div></section>
    </div></aside></div>}
  </AdminLayout>
}
