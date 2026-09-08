import { CheckCircle2, CreditCard, Download, Eye, FileText, RefreshCw, Search, UserRoundCheck, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, downloadRegistrationDocument, getDocumentPreview,
  getRegistration, listRegistrations, replaceRegistrationDocument, updateRegistrationStatus,
} from '../services/adminService'

const labels = { pending: 'Pendiente', approved: 'Aprobado', observed: 'Observado', rejected: 'Rechazado' }
const documentLabels = { bachelorDiploma: 'Diploma de bachiller', suneduRegistration: 'Ficha SUNEDU', futRequest: 'FUT de solicitud', paymentVoucher: 'Vouchers de pago' }

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [checked, setChecked] = useState({})
  const [preview, setPreview] = useState(null)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try { setItems((await listRegistrations(filter)).data) }
    catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login') }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [filter])
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview])

  const visible = useMemo(() => items.filter((item) =>
    `${item.first_names} ${item.last_names} ${item.dni} ${item.email}`.toLowerCase().includes(search.toLowerCase())), [items, search])
  const allChecked = selected?.documents?.length === 4 && selected.documents.every((doc) => checked[doc.id])

  const openDetail = async (id) => {
    try { setSelected((await getRegistration(id)).data); setChecked({}); setPreview(null) }
    catch (error) { Swal.fire('Error', error.message, 'error') }
  }

  const openPreview = async (document) => {
    try {
      if (preview?.url) URL.revokeObjectURL(preview.url)
      const url = await getDocumentPreview(selected.id, document.id)
      setPreview({ url, name: document.original_name })
    } catch (error) { Swal.fire('Error', error.message, 'error') }
  }

  const replaceDocument = async (document, file) => {
    if (!file) return
    const confirmation = await Swal.fire({ title: '¿Reemplazar este documento?', text: `${documentLabels[document.document_type]} será sustituido por ${file.name}.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, reemplazar', cancelButtonText: 'Cancelar', confirmButtonColor: '#0b4d96' })
    if (!confirmation.isConfirmed) return
    try {
      await replaceRegistrationDocument(selected.id, document.id, file)
      setSelected((await getRegistration(selected.id)).data)
      setChecked({ ...checked, [document.id]: false })
      Swal.fire({ title: 'Documento actualizado', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('Error', error.message, 'error') }
  }

  const changeStatus = async (status) => {
    if (status === 'approved' && !allChecked) return
    const result = status === 'observed'
      ? await Swal.fire({ title: 'Indica la observación', input: 'textarea', inputLabel: 'Este mensaje se enviará al participante por WhatsApp', inputPlaceholder: 'Describe qué documento debe corregir y por qué…', inputValidator: value => !value.trim() && 'La observación es obligatoria', showCancelButton: true, confirmButtonText: 'Guardar y abrir WhatsApp', cancelButtonText: 'Cancelar', confirmButtonColor: '#5279aa' })
      : await Swal.fire({ title: `¿Marcar como ${labels[status].toLowerCase()}?`, text: status === 'approved' ? 'Se enviará un correo de confirmación al participante.' : undefined, icon: 'question', showCancelButton: true, confirmButtonText: 'Confirmar', cancelButtonText: 'Cancelar', confirmButtonColor: '#0b4d96' })
    if (!result.isConfirmed) return
    try {
      const observation = status === 'observed' ? result.value.trim() : undefined
      const response = await updateRegistrationStatus(selected.id, status, observation)
      setSelected({ ...selected, status }); await load()
      if (status === 'observed') {
        const phone = selected.phone.replace(/\D/g, '').replace(/^0+/, '')
        const peruPhone = phone.startsWith('51') ? phone : `51${phone}`
        const message = `Hola ${selected.first_names}, revisamos tu inscripción al Curso Taller de Investigación Aplicada.\n\nObservación: ${observation}\n\nPor favor, envía por este medio el archivo PDF corregido para que el personal administrativo actualice tu inscripción.`
        window.open(`https://wa.me/${peruPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
        Swal.fire({ title: 'Observación registrada', text: 'Se abrió WhatsApp con el mensaje preparado para el participante.', icon: 'success', confirmButtonColor: '#0b4d96' })
      } else if (status === 'approved' && !response.data.email.sent) {
        Swal.fire({ title: 'Inscripción aprobada', text: 'El estado se actualizó, pero el correo no se envió porque SMTP aún no está configurado.', icon: 'warning', confirmButtonColor: '#0b4d96' })
      } else {
        Swal.fire({ title: status === 'approved' ? 'Aprobación y correo enviados' : 'Estado actualizado', icon: 'success', confirmButtonColor: '#0b4d96' })
      }
    } catch (error) { Swal.fire('Error', error.message, 'error') }
  }

  return <AdminLayout>
    <main className="admin-main">
      <div className="admin-title"><div><span className="section-kicker">ADMISIONES · 2026</span><h1>Inscripciones</h1><p>Revisa y valida las solicitudes recibidas.</p></div><div className="flex flex-wrap justify-end gap-2"><Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white" to="/admin/pagos"><CreditCard size={17} /> Gestionar pagos</Link><button onClick={load}><RefreshCw size={17} /> Actualizar</button></div></div>
      <section className="admin-stats"><div><FileText /><span><small>TOTAL</small><b>{items.length}</b></span></div><div><UserRoundCheck /><span><small>PENDIENTES</small><b>{items.filter(i => i.status === 'pending').length}</b></span></div><div><CheckCircle2 /><span><small>APROBADAS</small><b>{items.filter(i => i.status === 'approved').length}</b></span></div></section>
      <section className="admin-content">
        <div className="admin-toolbar"><label><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI o correo" /></label><select value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos los estados</option><option value="pending">Pendientes</option><option value="approved">Aprobados</option><option value="observed">Observados</option><option value="rejected">Rechazados</option></select></div>
        <div className="admin-table-wrap"><table><thead><tr><th>Postulante</th><th>DNI</th><th>Contacto</th><th>Documentos</th><th>Estado</th><th></th></tr></thead><tbody>{!loading && visible.map(item => <tr key={item.id}><td><b>{item.first_names} {item.last_names}</b><small>{new Date(item.created_at).toLocaleDateString('es-PE')}</small></td><td>{item.dni}</td><td><span>{item.email}</span><small>{item.phone}</small></td><td>{item.document_count}/4</td><td><span className={`status ${item.status}`}>{labels[item.status]}</span></td><td><button onClick={() => openDetail(item.id)}><Eye size={16} /> Revisar</button></td></tr>)}</tbody></table>{loading && <div className="admin-empty">Cargando inscripciones…</div>}{!loading && !visible.length && <div className="admin-empty">No se encontraron inscripciones.</div>}</div>
      </section>
    </main>

    {selected && <div className="admin-overlay" onMouseDown={e => e.target === e.currentTarget && setSelected(null)}>
      <aside className="review-panel">
        <header><div><span className={`status ${selected.status}`}>{labels[selected.status]}</span><h2>{selected.first_names} {selected.last_names}</h2><p>DNI {selected.dni}</p></div><button onClick={() => setSelected(null)}><X /></button></header>
        <div className="review-body">
          <section><h3>Datos del participante</h3><p><span>Correo</span><b>{selected.email}</b></p><p><span>Celular</span><b>{selected.phone}</b></p><p><span>Modalidad de pago</span><b>{selected.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1'}</b></p></section>
          <section><h3>Documentos presentados</h3><p className="review-help">Visualiza cada PDF, reemplázalo si recibiste una corrección por WhatsApp y marca la casilla cuando sea correcto.</p><div className="review-documents">{selected.documents.map(doc => <div className="review-document" key={doc.id}><button className="document-preview-button" onClick={() => openPreview(doc)}><FileText size={19} /><span><b>{documentLabels[doc.document_type]}</b><small>{doc.original_name}</small></span><Eye size={17} /></button><button className="document-download" title="Descargar" onClick={() => downloadRegistrationDocument(selected.id, doc)}><Download size={17} /></button><label className="document-replace"><input type="file" accept="application/pdf,.pdf" onChange={event => { replaceDocument(doc, event.target.files[0]); event.target.value = '' }} /><span>Reemplazar PDF</span></label><label className="document-check"><input type="checkbox" checked={Boolean(checked[doc.id])} onChange={e => setChecked({ ...checked, [doc.id]: e.target.checked })} /><span>Correcto</span></label></div>)}</div></section>
        </div>
        <footer><span>Actualizar resultado de revisión</span><div><button className="observe" onClick={() => changeStatus('observed')}>Observar</button><button className="reject" onClick={() => changeStatus('rejected')}>Rechazar</button><button className="approve" disabled={!allChecked} title={!allChecked ? 'Verifica los cuatro documentos para aprobar' : ''} onClick={() => changeStatus('approved')}>Aprobar</button></div>{!allChecked && <small>Marca los 4 documentos como correctos para habilitar la aprobación.</small>}</footer>
      </aside>
    </div>}

    {preview && <div className="preview-overlay"><section className="pdf-preview"><header><div><FileText size={19} /><span><b>Vista previa</b><small>{preview.name}</small></span></div><button onClick={() => setPreview(null)}><X /></button></header><iframe src={preview.url} title={`Vista previa de ${preview.name}`} /></section></div>}
  </AdminLayout>
}
