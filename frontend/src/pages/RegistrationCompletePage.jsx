import { ArrowRight, Check, Mail, ShieldCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Shell from '../components/Shell'

export default function RegistrationCompletePage() {
  const navigate = useNavigate()
  return <Shell step={3}><main className="success-page"><section className="success-card"><div className="success-icon"><Check size={38} /></div><span className="section-kicker">SOLICITUD RECIBIDA</span><h1>Inscripción completa</h1><p>Ahora el personal de la Facultad de Ingeniería verificará los documentos que presentaste.</p><div className="success-notice"><Mail size={22} /><div><b>Revisa tu correo electrónico</b><span>Luego de la revisión te enviaremos un correo con la confirmación o las observaciones correspondientes.</span></div></div><div className="success-security"><ShieldCheck size={17} /> Tus documentos fueron enviados de forma segura.</div><button onClick={() => navigate('/', { replace: true })}>Finalizar <ArrowRight size={18} /></button></section></main></Shell>
}
