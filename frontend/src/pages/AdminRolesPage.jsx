import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import {
  clearAdminToken, createRole, deleteRole, hasAdminPermission,
  listPermissions, listRoles, updateRole,
} from '../services/adminService'

const emptyForm = { name: '', description: '', permissionIds: [], isActive: true }
const permissionDependencies = {
  'registrations.manage': 'registrations.view',
  'registrations.delete': 'registrations.view',
  'payments.manage': 'payments.view',
  'reports.export': 'reports.view',
  'users.manage': 'users.view',
  'roles.manage': 'roles.view',
}

export default function AdminRolesPage() {
  const navigate = useNavigate()
  const canManage = hasAdminPermission('roles.manage')
  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([listRoles(), listPermissions()])
      setRoles(rolesResponse.data)
      setPermissions(permissionsResponse.data)
    } catch (error) {
      if (error.status === 401) { clearAdminToken(); navigate('/admin/login', { replace: true }) }
      else Swal.fire('Error', error.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const groupedPermissions = useMemo(() => permissions.reduce((groups, permission) => {
    if (!groups[permission.module]) groups[permission.module] = []
    groups[permission.module].push(permission)
    return groups
  }, {}), [permissions])

  const visible = useMemo(() => roles.filter(role =>
    `${role.name} ${role.description || ''}`.toLowerCase().includes(search.toLowerCase())), [roles, search])

  const openCreate = () => { setEditingId(null); setForm({ ...emptyForm, permissionIds: [] }) }
  const openEdit = role => {
    setEditingId(role.id)
    setForm({ name: role.name, description: role.description || '', permissionIds: role.permissions.map(permission => permission.id), isActive: Boolean(role.is_active) })
  }

  const togglePermission = permissionId => {
    const permission = permissions.find(item => item.id === permissionId)
    const isSelected = form.permissionIds.includes(permissionId)
    if (isSelected) {
      const dependentIds = permissions
        .filter(item => permissionDependencies[item.code] === permission.code)
        .map(item => item.id)
      setForm({ ...form, permissionIds: form.permissionIds.filter(id => id !== permissionId && !dependentIds.includes(id)) })
      return
    }
    const requiredCode = permissionDependencies[permission.code]
    const requiredId = permissions.find(item => item.code === requiredCode)?.id
    setForm({ ...form, permissionIds: [...new Set([...form.permissionIds, permissionId, ...(requiredId ? [requiredId] : [])])] })
  }

  const toggleModule = modulePermissions => {
    const moduleIds = modulePermissions.map(permission => permission.id)
    const allSelected = moduleIds.every(id => form.permissionIds.includes(id))
    setForm({
      ...form,
      permissionIds: allSelected
        ? form.permissionIds.filter(id => !moduleIds.includes(id))
        : [...new Set([...form.permissionIds, ...moduleIds])],
    })
  }

  const submit = async event => {
    event.preventDefault()
    if (!form.name.trim() || !form.permissionIds.length) return Swal.fire('Revisa el formulario', 'Indica un nombre y selecciona al menos un permiso.', 'warning')
    setSaving(true)
    try {
      const payload = { ...form, name: form.name.trim(), description: form.description.trim() }
      if (editingId) await updateRole(editingId, payload)
      else await createRole(payload)
      setForm(null)
      await load()
      Swal.fire({ title: editingId ? 'Rol actualizado' : 'Rol creado', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo guardar', error.message, 'error') }
    finally { setSaving(false) }
  }

  const remove = async role => {
    const result = await Swal.fire({
      title: '¿Eliminar este rol?', text: `Se eliminará el rol “${role.name}” y su asignación de permisos.`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#b4232d',
    })
    if (!result.isConfirmed) return
    try {
      await deleteRole(role.id)
      await load()
      Swal.fire({ title: 'Rol eliminado', icon: 'success', timer: 1300, showConfirmButton: false })
    } catch (error) { Swal.fire('No se pudo eliminar', error.message, 'error') }
  }

  return <AdminLayout>
    <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><span className="section-kicker">CONTROL DE ACCESO</span><h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">Roles y permisos</h1><p className="mt-1 text-sm text-slate-500">Define qué módulos y acciones puede utilizar cada tipo de usuario.</p></div>
        {canManage && <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white" onClick={openCreate}><Plus size={18} /> Nuevo rol</button>}
      </div>

      <section className="my-7 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><ShieldCheck className="text-undc-cyan" /><small className="mt-3 block text-xs font-bold text-slate-400">ROLES</small><b className="font-display text-2xl text-undc-navy">{roles.length}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><KeyRound className="text-undc-blue" /><small className="mt-3 block text-xs font-bold text-slate-400">PERMISOS DISPONIBLES</small><b className="font-display text-2xl text-undc-navy">{permissions.length}</b></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><UsersRound className="text-emerald-600" /><small className="mt-3 block text-xs font-bold text-slate-400">USUARIOS ASIGNADOS</small><b className="font-display text-2xl text-undc-navy">{roles.reduce((total, role) => total + Number(role.user_count), 0)}</b></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4"><label className="flex max-w-md items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400"><Search size={17} /><input className="w-full border-0 py-3 text-sm text-slate-700 outline-none" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre o descripción" /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-4">Rol</th><th className="p-4">Permisos</th><th className="p-4">Usuarios</th><th className="p-4">Estado</th><th className="p-4"></th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(role => <tr key={role.id}><td className="p-4"><div className="flex items-center gap-2"><b className="text-undc-navy">{role.name}</b>{role.is_system ? <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-undc-blue">SISTEMA</span> : null}</div><small className="mt-1 block max-w-md text-slate-500">{role.description || 'Sin descripción'}</small></td><td className="p-4"><b className="text-undc-navy">{role.permissions.length}</b><small className="ml-1 text-slate-500">asignados</small></td><td className="p-4 font-semibold text-slate-700">{role.user_count}</td><td className="p-4"><span className={`status ${role.is_active ? 'approved' : 'rejected'}`}>{role.is_active ? 'Activo' : 'Inactivo'}</span></td><td className="p-4"><div className="flex justify-end gap-2">{canManage && !role.is_system && <button aria-label={`Editar ${role.name}`} className="grid size-10 place-items-center rounded-lg bg-blue-50 text-undc-blue" onClick={() => openEdit(role)}><Pencil size={16} /></button>}{canManage && !role.is_system && <button aria-label={`Eliminar ${role.name}`} className="grid size-10 place-items-center rounded-lg bg-red-50 text-red-700" onClick={() => remove(role)}><Trash2 size={16} /></button>}</div></td></tr>)}</tbody></table>{loading && <p className="p-10 text-center text-slate-500">Cargando roles…</p>}{!loading && !visible.length && <p className="p-10 text-center text-slate-500">No se encontraron roles.</p>}</div>
      </section>
    </main>

    {form && <div className="admin-overlay" onMouseDown={event => event.target === event.currentTarget && setForm(null)}>
      <form className="review-panel" onSubmit={submit}>
        <header>
          <div>
            <span className="section-kicker">PERFIL DE ACCESO</span>
            <h2>{editingId ? 'Editar rol' : 'Nuevo rol'}</h2>
            <p>Configura el perfil y las acciones que tendrá disponibles.</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={() => setForm(null)}><X /></button>
        </header>
        <div className="review-body">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]"><label><span className="mb-2 block text-sm font-bold text-slate-700">Nombre del rol *</span><input className="min-h-12 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-undc-cyan" maxLength="100" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} required /></label><label><span className="mb-2 block text-sm font-bold text-slate-700">Estado *</span><select className="min-h-12 rounded-lg border border-slate-300 bg-white px-3" value={String(form.isActive)} onChange={event => setForm({ ...form, isActive: event.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></select></label></div>
            <label><span className="mb-2 block text-sm font-bold text-slate-700">Descripción</span><textarea className="min-h-20 w-full resize-y rounded-lg border border-slate-300 p-3 outline-none focus:border-undc-cyan" maxLength="255" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
            <section><div className="mb-3 flex items-center justify-between"><div><h3 className="font-display font-extrabold text-undc-navy">Permisos *</h3><p className="text-sm text-slate-500">Selecciona al menos uno.</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-undc-blue">{form.permissionIds.length} seleccionados</span></div><div className="grid gap-4">{Object.entries(groupedPermissions).map(([module, modulePermissions]) => { const allSelected = modulePermissions.every(permission => form.permissionIds.includes(permission.id)); return <article className="overflow-hidden rounded-xl border border-slate-200" key={module}><header className="flex items-center justify-between bg-slate-50 px-4 py-3"><b className="text-sm text-undc-navy">{module}</b><button type="button" className="text-xs font-bold text-undc-blue" onClick={() => toggleModule(modulePermissions)}>{allSelected ? 'Quitar todos' : 'Seleccionar todos'}</button></header><div className="divide-y divide-slate-100">{modulePermissions.map(permission => <label className="flex cursor-pointer items-start gap-3 p-3 hover:bg-slate-50" key={permission.id}><input className="mt-1 size-4 accent-[#0b4ea2]" type="checkbox" checked={form.permissionIds.includes(permission.id)} onChange={() => togglePermission(permission.id)} /><span><b className="block text-sm text-slate-700">{permission.name}</b><small className="mt-1 block leading-5 text-slate-500">{permission.description}</small></span></label>)}</div></article> })}</div></section>
          </div>
        </div>
        <footer>
          <span>Acciones del formulario</span>
          <div><button type="button" className="observe" onClick={() => setForm(null)}>Cancelar</button><button className="approve" disabled={saving}>{saving ? 'Guardando…' : 'Guardar rol'}</button></div>
        </footer>
      </form>
    </div>}
  </AdminLayout>
}
