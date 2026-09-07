import { ArrowLeft, LockKeyhole, LogIn, Mail, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import Brand from '../components/Brand'
import { loginAdmin, saveAdminToken } from '../services/adminService'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const handleSubmit = async (event) => {
    event.preventDefault(); setLoading(true)
    try {
      const { data } = await loginAdmin(Object.fromEntries(new FormData(event.currentTarget)))
      saveAdminToken(data.token)
      await Swal.fire({ title: `Bienvenido, ${data.admin.name}`, icon: 'success', timer: 1200, showConfirmButton: false })
      navigate('/admin', { replace: true })
    } catch (error) { Swal.fire({ title: 'Acceso denegado', text: error.message, icon: 'error', confirmButtonColor: '#0b4d96' }) }
    finally { setLoading(false) }
  }
  return <main className="admin-login-page"><section className="admin-login-brand"><Brand /><div><span className="section-kicker">GESTIÓN ACADÉMICA</span><h1>Panel administrativo</h1><p>Revisa las solicitudes y valida la documentación presentada por los postulantes.</p></div><small><ShieldCheck size={16} /> Acceso exclusivo para personal autorizado</small></section><section className="admin-login-form"><form onSubmit={handleSubmit}><div className="admin-lock"><LockKeyhole size={25} /></div><h2>Iniciar sesión</h2><p>Ingresa tus credenciales administrativas.</p><label><span>Correo institucional</span><div><Mail size={17} /><input name="email" type="email" placeholder="administrador@undc.edu.pe" required autoComplete="username" /></div></label><label><span>Contraseña</span><div><LockKeyhole size={17} /><input name="password" type="password" placeholder="••••••••" required autoComplete="current-password" /></div></label><button disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar al panel'} <LogIn size={17} /></button><Link to="/"><ArrowLeft size={16} /> Volver al sitio</Link></form></section></main>
}
