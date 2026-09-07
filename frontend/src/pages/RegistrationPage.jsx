import { ArrowLeft, FileText, Send, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import Shell from '../components/Shell'
import { createRegistration } from '../services/registrationService'

const documentFields = [
  ['bachelorDiploma', 'Diploma de bachiller', 'Diploma de bachiller en PDF'],
  ['suneduRegistration', 'Ficha de inscripción en SUNEDU', 'Ficha de inscripción en formato PDF'],
  ['futRequest', 'FUT de solicitud al coordinador', 'Solicitud dirigida al coordinador en PDF'],
  ['paymentVoucher', 'Vouchers de pago', 'Inscripción + I módulo en un solo PDF'],
]

export default function RegistrationPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.checkValidity()) return form.reportValidity()

    const confirmation = await Swal.fire({
      title: '¿Enviar inscripción?',
      text: 'Verifica que tus datos y documentos sean correctos antes de continuar.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, enviar',
      cancelButtonText: 'Revisar',
      confirmButtonColor: '#0b4d96',
    })
    if (!confirmation.isConfirmed) return

    setSubmitting(true)
    Swal.fire({ title: 'Enviando inscripción', text: 'Estamos guardando tus datos y documentos.', allowOutsideClick: false, didOpen: () => Swal.showLoading() })
    try {
      await createRegistration(new FormData(form))
      await Swal.fire({ title: '¡Inscripción registrada!', text: 'Tus documentos fueron recibidos correctamente.', icon: 'success', confirmButtonText: 'Continuar', confirmButtonColor: '#0b4d96' })
      navigate('/inscripcion-completa', { replace: true })
    } catch (error) {
      Swal.fire({ title: 'No pudimos enviar la inscripción', text: error.message, icon: 'error', confirmButtonText: 'Entendido', confirmButtonColor: '#0b4d96' })
    } finally { setSubmitting(false) }
  }

  return <Shell step={3}><main className="registration-page"><Link className="back" to="/informacion"><ArrowLeft size={17} /> Regresar a la información</Link><header className="form-heading"><span className="section-kicker">ÚLTIMO PASO</span><h1>Formulario de inscripción</h1><p>Completa tus datos personales y adjunta los documentos solicitados en formato PDF.</p></header><form className="registration-form" onSubmit={handleSubmit}><section className="form-section"><div className="form-section-title"><span>01</span><div><h2>Datos personales</h2><p>Usaremos estos datos para identificar y contactar al postulante.</p></div></div><div className="fields-grid"><label><span>Nombres *</span><input name="firstNames" type="text" maxLength="120" placeholder="Ingresa tus nombres" required /></label><label><span>Apellidos *</span><input name="lastNames" type="text" maxLength="120" placeholder="Ingresa tus apellidos" required /></label><label><span>DNI *</span><input name="dni" type="text" inputMode="numeric" pattern="[0-9]{8}" maxLength="8" placeholder="8 dígitos" required /></label><label><span>Correo electrónico *</span><input name="email" type="email" maxLength="180" placeholder="nombre@correo.com" required /></label><label><span>Celular *</span><input name="phone" type="tel" inputMode="tel" pattern="[0-9+ ]{9,15}" maxLength="15" placeholder="987 654 321" required /></label></div></section><section className="form-section"><div className="form-section-title"><span>02</span><div><h2>Documentos</h2><p>Formato PDF, con un tamaño máximo de 5 MB por archivo.</p></div></div><div className="upload-grid">{documentFields.map(([name, title, description], index) => <label className="upload-field" key={name}><input name={name} type="file" accept="application/pdf,.pdf" required /><span className="upload-icon"><Upload size={20} /></span><span className="upload-copy"><b>{index + 6}. {title} *</b><small>{description}</small></span><FileText size={18} /></label>)}</div></section><div className="form-actions"><Link to="/informacion"><ArrowLeft size={17} /> Volver</Link><button type="submit" disabled={submitting}>{submitting ? 'Enviando…' : 'Enviar inscripción'} <Send size={18} /></button></div></form></main></Shell>
}
