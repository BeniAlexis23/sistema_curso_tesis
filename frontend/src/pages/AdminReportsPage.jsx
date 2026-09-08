import { Download, FileSpreadsheet, FileText, Search, UsersRound, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import { clearAdminToken, downloadReport, getReport } from '../services/adminService'

const money = value => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(value))
const statuses = { pending: 'Pendiente', approved: 'Aprobado', observed: 'Observado', rejected: 'Rechazado' }

export default function AdminReportsPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    getReport().then(response => setRows(response.data)).catch(error => {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login') }
      else Swal.fire('Error', error.message, 'error')
    }).finally(() => setLoading(false))
  }, [])

  const visible = useMemo(() => rows.filter(row => `${row.participant} ${row.dni} ${row.email}`.toLowerCase().includes(search.toLowerCase())), [rows, search])
  const totals = rows.reduce((summary, row) => ({ total: summary.total + Number(row.total_amount), paid: summary.paid + Number(row.paid_amount), pending: summary.pending + Number(row.pending_amount) }), { total: 0, paid: 0, pending: 0 })
  const exportFile = async format => {
    setExporting(format)
    try { await downloadReport(format) }
    catch (error) { Swal.fire('No se pudo exportar', error.message, 'error') }
    finally { setExporting('') }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div><span className="section-kicker">ANÁLISIS ADMINISTRATIVO · 2026</span><h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">Reportes</h1><p className="mt-1 text-sm text-slate-500">Resumen consolidado de inscritos y seguimiento económico.</p></div>
        <div className="flex flex-col gap-2 sm:flex-row"><button className="report-export report-export-pdf" disabled={Boolean(exporting)} onClick={() => exportFile('pdf')}><FileText size={18} />{exporting === 'pdf' ? 'Generando…' : 'Exportar PDF'}<Download size={15} /></button><button className="report-export report-export-excel" disabled={Boolean(exporting)} onClick={() => exportFile('excel')}><FileSpreadsheet size={18} />{exporting === 'excel' ? 'Generando…' : 'Exportar Excel'}<Download size={15} /></button></div>
      </div>
      <section className="my-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UsersRound className="text-undc-cyan" /><small className="mt-3 block text-xs font-bold text-slate-400">INSCRITOS</small><b className="font-display text-2xl text-undc-navy">{rows.length}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><WalletCards className="text-undc-blue" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL PROGRAMADO</small><b className="font-display text-2xl text-undc-navy">{money(totals.total)}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><WalletCards className="text-emerald-600" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL PAGADO</small><b className="font-display text-2xl text-undc-navy">{money(totals.paid)}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><WalletCards className="text-amber-500" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL PENDIENTE</small><b className="font-display text-2xl text-undc-navy">{money(totals.pending)}</b></div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><label className="flex max-w-md items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400"><Search size={17} /><input className="w-full border-0 py-3 text-sm text-slate-700 outline-none" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre, DNI o correo" /></label></div>
        <div className="overflow-x-auto"><table className="report-table"><thead><tr><th>Participante</th><th>DNI</th><th>Modalidad</th><th>Estado</th><th>Cuotas</th><th>Total</th><th>Pagado</th><th>Pendiente</th></tr></thead><tbody>{visible.map(row => <tr key={row.id}><td><b>{row.participant}</b><small>{row.email}</small></td><td>{row.dni}</td><td>{row.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1'}</td><td><span className={`status ${row.registration_status}`}>{statuses[row.registration_status]}</span></td><td>{row.paid_installments}/{row.installment_count}</td><td>{money(row.total_amount)}</td><td className="paid-value">{money(row.paid_amount)}</td><td className="pending-value">{money(row.pending_amount)}</td></tr>)}</tbody></table>{loading && <p className="p-10 text-center text-slate-500">Cargando reporte…</p>}{!loading && !visible.length && <p className="p-10 text-center text-slate-500">No se encontraron registros.</p>}</div>
      </section>
    </main>
  </AdminLayout>
}
