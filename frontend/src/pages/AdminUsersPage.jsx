import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, UsersRound, UserX, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, createUser, deleteUser, getAdminSession, hasAdminPermission,
  listUserRoleOptions, listUsers, updateUser,
} from '../services/adminService'

const emptyForm = { name: '', email: '', password: '', roleId: '', isActive: true }
const date = value => new Date(value).toLocaleDateString('es-PE')

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const currentUserId = getAdminSession()?.id
  const canManage = hasAdminPermission('users.manage')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        listUsers(),
        canManage ? listUserRoleOptions() : Promise.resolve({ data: [] }),
      ])
      setUsers(usersResponse.data)
      setRoles(rolesResponse.data)
    } catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }) }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const visible = useMemo(() => users.filter(user =>
    `${user.name} ${user.email} ${user.role_name}`.toLowerCase().includes(search.toLowerCase())), [users, search])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm, roleId: roles[0]?.id ? String(roles[0].id) : '' })
  }

  const openEdit = user => {
    setEditingId(user.id)
    setForm({ name: user.name, email: user.email, password: '', roleId: String(user.role_id), isActive: Boolean(user.is_active) })
  }

  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || !form.roleId || (!editingId && form.password.length < 8) || (editingId && form.password && form.password.length < 8)) {
      return Swal.fire('Revisa el formulario', 'La contraseña debe tener al menos 8 caracteres y todos los campos obligatorios deben ser válidos.', 'warning')
    }
    setSaving(true)
    try {
      const payload = { ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), roleId: Number(form.roleId) }
      if (editingId) await updateUser(editingId, payload)
      else await createUser(payload)
      setForm(null)
      await load()
      Swal.fire({ title: editingId ? 'Usuario actualizado' : 'Usuario creado', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo guardar', error.message, 'error') }
    finally { setSaving(false) }
  }

  const remove = async user => {
    const result = await Swal.fire({
      title: '¿Eliminar este usuario?',
      text: `${user.name} perderá definitivamente el acceso al panel.`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b4232d',
    })
    if (!result.isConfirmed) return
    try {
      await deleteUser(user.id)
      await load()
      Swal.fire({ title: 'Usuario eliminado', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo eliminar', error.message, 'error') }
  }

  const activeUsers = users.filter(user => user.is_active).length

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><span className="section-kicker">SEGURIDAD Y ACCESO</span><h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">Usuarios</h1><p className="mt-1 text-sm text-slate-500">Administra las cuentas que pueden ingresar al panel.</p></div>
        {canManage && <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white" onClick={openCreate}><Plus size={18} /> Nuevo usuario</button>}
      </div>

      <section className="my-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UsersRound className="text-undc-cyan" /><small className="mt-3 block text-xs font-bold text-slate-400">TOTAL USUARIOS</small><b className="font-display text-2xl text-undc-navy">{users.length}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UserCheck className="text-emerald-600" /><small className="mt-3 block text-xs font-bold text-slate-400">ACTIVOS</small><b className="font-display text-2xl text-undc-navy">{activeUsers}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UserX className="text-amber-500" /><small className="mt-3 block text-xs font-bold text-slate-400">INACTIVOS</small><b className="font-display text-2xl text-undc-navy">{users.length - activeUsers}</b></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><label className="flex max-w-md items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400"><Search size={17} /><input className="w-full border-0 py-3 text-sm text-slate-700 outline-none" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre, correo o rol" /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Usuario</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Creado</th><th className="p-4"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(user => <tr key={user.id}><td className="p-4"><b className="block text-undc-navy">{user.name}{Number(user.id) === Number(currentUserId) && <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-[10px] text-undc-blue">Tú</span>}</b><small className="mt-1 block text-slate-500">{user.email}</small></td><td className="p-4"><span className="inline-flex items-center gap-2 font-semibold text-slate-700"><ShieldCheck size={16} className="text-undc-cyan" />{user.role_name}</span></td><td className="p-4"><span className={`status ${user.is_active ? 'approved' : 'rejected'}`}>{user.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="p-4 text-slate-500">{date(user.created_at)}</td><td className="p-4"><div className="flex justify-end gap-2">{canManage && <button aria-label={`Editar a ${user.name}`} className="grid size-10 place-items-center rounded-lg bg-blue-50 text-undc-blue" onClick={() => openEdit(user)}><Pencil size={16} /></button>}{canManage && Number(user.id) !== Number(currentUserId) && <button aria-label={`Eliminar a ${user.name}`} className="grid size-10 place-items-center rounded-lg bg-red-50 text-red-700" onClick={() => remove(user)}><Trash2 size={16} /></button>}</div></td></tr>)}</tbody></table>{loading && <p className="p-10 text-center text-slate-500">Cargando usuarios…</p>}{!loading && !visible.length && <p className="p-10 text-center text-slate-500">No se encontraron usuarios.</p>}</div>
      </section>
    </main>

    {form && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setForm(null)}>
      <form className="review-panel" onSubmit={submit}>
        <header>
          <div>
            <span className="section-kicker">CUENTA ADMINISTRATIVA</span>
            <h2>{editingId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
            <p>Completa los datos de acceso y asigna un rol.</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => setForm(null)}><X /></button>
        </header>
        <div className="review-body">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Nombre completo *</span><input className="min-h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-undc-cyan" maxLength="120" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
            <label className="sm:col-span-2"><span className="mb-2 block text-sm font-bold text-slate-700">Correo *</span><input className="min-h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-undc-cyan" type="email" maxLength="180" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></label>
            <label><span className="mb-2 block text-sm font-bold text-slate-700">Rol *</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={form.roleId} onChange={event => setForm({ ...form, roleId: event.target.value })} required>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-bold text-slate-700">Estado *</span><select className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3" value={String(form.isActive)} disabled={Number(editingId) === Number(currentUserId)} onChange={event => setForm({ ...form, isActive: event.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label>
            <label className="sm:col-span-2"><span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><KeyRound size={16} />{editingId ? 'Nueva contraseña (opcional)' : 'Contraseña *'}</span><input className="min-h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-undc-cyan" type="password" minLength="8" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} required={!editingId} /><small className="mt-1 block text-slate-500">Mínimo 8 caracteres.{editingId && ' Déjala vacía para conservar la actual.'}</small></label>
          </div>
        </div>
        <footer>
          <span>Acciones del formulario</span>
          <div><button type="button" className="observe" onClick={() => setForm(null)}>Cancelar</button><button className="approve" disabled={saving}>{saving ? 'Guardando…' : 'Guardar usuario'}</button></div>
        </footer>
      </form>
    </div>}
  </AdminLayout>
}
