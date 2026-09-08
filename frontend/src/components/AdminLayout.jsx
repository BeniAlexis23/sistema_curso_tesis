import { ClipboardCheck, CreditCard, Home, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { clearAdminToken } from '../services/adminService'
import Brand from './Brand'

const modules = [
  { to: '/admin', label: 'Inscripciones', icon: ClipboardCheck, end: true },
  { to: '/admin/pagos', label: 'Seguimiento de pagos', icon: CreditCard },
]

function ModuleLinks({ closeMenu }) {
  return <>{modules.map(({ to, label, icon: Icon, end }) => <NavLink end={end} key={to} onClick={closeMenu} to={to} className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-bold transition ${isActive ? 'bg-undc-blue text-white shadow-lg shadow-blue-950/20' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon size={19} />{label}</NavLink>)}</>
}

export default function AdminLayout({ children }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const logout = () => { clearAdminToken(); navigate('/admin/login', { replace: true }) }
  return <div className="min-h-screen bg-[#f4f6f9] lg:flex">
    <aside className="admin-sidebar sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-undc-navy p-5 lg:flex">
      <div className="border-b border-white/10 pb-5"><Brand /></div>
      <nav className="flex-1 space-y-2"><p className="px-3 pb-2 pt-6 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Módulos</p><ModuleLinks /></nav>
      <div className="space-y-2 border-t border-white/10 pt-4"><Link className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-400 hover:bg-white/10 hover:text-white" to="/"><Home size={18} /> Ver sitio público</Link><button className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-slate-400 hover:bg-red-500/10 hover:text-red-300" onClick={logout}><LogOut size={18} /> Cerrar sesión</button></div>
    </aside>
    <header className="admin-mobile-header sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden"><Brand /><button aria-expanded={open} aria-label="Abrir menú administrativo" className="grid size-11 shrink-0 place-items-center rounded-lg border border-slate-200 text-undc-navy" onClick={() => setOpen(true)}><Menu /></button></header>
    {open && <div className="fixed inset-0 z-40 bg-undc-navy/60 lg:hidden" onMouseDown={event => event.target === event.currentTarget && setOpen(false)}><aside className="admin-sidebar flex h-full w-[min(320px,90vw)] flex-col overflow-y-auto bg-undc-navy p-5"><div className="flex items-center justify-between gap-3 border-b border-white/10 pb-5"><Brand /><button aria-label="Cerrar menú" className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white" onClick={() => setOpen(false)}><X /></button></div><nav className="flex-1 space-y-2"><p className="px-3 pb-2 pt-6 text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Módulos</p><ModuleLinks closeMenu={() => setOpen(false)} /></nav><button className="flex min-h-11 items-center gap-3 border-t border-white/10 px-3 pt-4 text-sm font-semibold text-red-300" onClick={logout}><LogOut size={18} /> Cerrar sesión</button></aside></div>}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
}
