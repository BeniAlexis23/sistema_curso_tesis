import { CheckCircle2, Edit3, Mail, Plus, Search, ShieldAlert, UsersRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import AdminLayout from '../components/AdminLayout'
import { clearAdminToken, createUser, listUsers, updateUser } from '../services/adminService'

const formatDate = (value) => {
  if (!value) return '—'
  const dateObj = new Date(String(value).replace(' ', 'T'))
  if (isNaN(dateObj.getTime())) return String(value)
  return dateObj.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const response = await listUsers()
      setUsers(response.data || [])
    } catch (error) {
      if (error.status === 401) {
        clearAdminToken()
        navigate('/admin/login')
      } else {
        Swal.fire('Error', error.message, 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return users
    return users.filter((u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(term)
    )
  }, [users, search])

  const activeCount = users.filter((u) => Boolean(u.is_active)).length
  const inactiveCount = users.length - activeCount

  const handleCreateUser = async () => {
    const result = await Swal.fire({
      title: 'Crear nuevo usuario',
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Nombre completo *</label>
          <input id="create-name" class="swal2-input" style="width:100%;margin:0 0 14px" placeholder="Ej. Dr. Carlos Almidón Ortiz">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Correo institucional *</label>
          <input id="create-email" type="email" class="swal2-input" style="width:100%;margin:0 0 14px" placeholder="nombre@undc.edu.pe">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Contraseña inicial *</label>
          <input id="create-password" type="password" class="swal2-input" style="width:100%;margin:0" placeholder="Mínimo 6 caracteres">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Crear usuario',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0b4d96',
      preConfirm: () => {
        const name = document.getElementById('create-name').value.trim()
        const email = document.getElementById('create-email').value.trim()
        const password = document.getElementById('create-password').value

        if (!name || !email || !password) {
          return Swal.showValidationMessage('Todos los campos son obligatorios')
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          return Swal.showValidationMessage('Ingresa un correo electrónico válido')
        }
        if (password.length < 6) {
          return Swal.showValidationMessage('La contraseña debe tener al menos 6 caracteres')
        }
        return { name, email, password }
      },
    })

    if (!result.isConfirmed) return

    try {
      await createUser(result.value)
      await load()
      Swal.fire({
        title: '¡Usuario creado!',
        text: 'El nuevo administrador fue registrado correctamente.',
        icon: 'success',
        confirmButtonColor: '#0b4d96',
      })
    } catch (error) {
      Swal.fire('No se pudo crear el usuario', error.message, 'error')
    }
  }

  const handleEditUser = async (user) => {
    const result = await Swal.fire({
      title: 'Editar usuario',
      html: `
        <div style="text-align:left">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Nombre completo *</label>
          <input id="edit-name" class="swal2-input" style="width:100%;margin:0 0 14px">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Correo institucional *</label>
          <input id="edit-email" type="email" class="swal2-input" style="width:100%;margin:0 0 14px">
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Estado *</label>
          <select id="edit-status" class="swal2-select" style="width:100%;margin:0 0 14px;display:flex">
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
          <label style="display:block;font-size:13px;font-weight:700;margin-bottom:4px;color:#283d57">Nueva contraseña (opcional)</label>
          <input id="edit-password" type="password" class="swal2-input" style="width:100%;margin:0" placeholder="Dejar en blanco para conservar la actual">
        </div>
      `,
      didOpen: () => {
        document.getElementById('edit-name').value = user.name
        document.getElementById('edit-email').value = user.email
        document.getElementById('edit-status').value = user.is_active ? '1' : '0'
      },
      showCancelButton: true,
      confirmButtonText: 'Guardar cambios',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#0b4d96',
      preConfirm: () => {
        const name = document.getElementById('edit-name').value.trim()
        const email = document.getElementById('edit-email').value.trim()
        const isActive = document.getElementById('edit-status').value === '1'
        const password = document.getElementById('edit-password').value

        if (!name || !email) {
          return Swal.showValidationMessage('El nombre y el correo son obligatorios')
        }
        if (!/^\S+@\S+\.\S+$/.test(email)) {
          return Swal.showValidationMessage('Ingresa un correo electrónico válido')
        }
        if (password && password.length < 6) {
          return Swal.showValidationMessage('La nueva contraseña debe tener al menos 6 caracteres')
        }

        const payload = { name, email, isActive }
        if (password) payload.password = password
        return payload
      },
    })

    if (!result.isConfirmed) return

    try {
      await updateUser(user.id, result.value)
      await load()
      Swal.fire({
        title: 'Usuario actualizado',
        icon: 'success',
        timer: 1300,
        showConfirmButton: false,
      })
    } catch (error) {
      Swal.fire('No se pudo actualizar el usuario', error.message, 'error')
    }
  }

  return (
    <AdminLayout>
      <main className="mx-auto w-[calc(100%-2rem)] max-w-[1240px] py-8 lg:py-10">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <span className="section-kicker">CONTROL DE ACCESOS</span>
            <h1 className="font-display mt-2 text-3xl font-extrabold text-undc-navy lg:text-4xl">
              Usuarios del sistema
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Administradores con credenciales y permisos en la plataforma.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-undc-blue px-4 text-sm font-bold text-white shadow-md shadow-blue-950/10 hover:bg-undc-navy transition cursor-pointer"
            onClick={handleCreateUser}
          >
            <Plus size={18} />
            Nuevo usuario
          </button>
        </div>

        <section className="my-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <UsersRound className="text-undc-cyan" />
            <small className="mt-3 block text-xs font-bold text-slate-400">TOTAL USUARIOS</small>
            <b className="font-display text-2xl text-undc-navy">{users.length}</b>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <CheckCircle2 className="text-emerald-600" />
            <small className="mt-3 block text-xs font-bold text-slate-400">USUARIOS ACTIVOS</small>
            <b className="font-display text-2xl text-undc-navy">{activeCount}</b>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <ShieldAlert className="text-slate-400" />
            <small className="mt-3 block text-xs font-bold text-slate-400">USUARIOS INACTIVOS</small>
            <b className="font-display text-2xl text-undc-navy">{inactiveCount}</b>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <label className="flex max-w-md items-center gap-2 rounded-lg border border-slate-300 px-3 text-slate-400">
              <Search size={17} />
              <input
                className="w-full border-0 py-3 text-sm text-slate-700 outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o correo"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-4">Administrador</th>
                  <th className="p-4">Correo institucional</th>
                  <th className="p-4">Rol</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Fecha de registro</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="grid size-10 place-items-center rounded-full bg-blue-50 text-undc-blue font-bold text-sm">
                          {user.name
                            .split(' ')
                            .map((word) => word[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <b className="block text-undc-navy">{user.name}</b>
                          <small className="text-slate-400">ID #{user.id}</small>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Mail size={15} className="text-slate-400" />
                        <span>{user.email}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {user.role === 'superadmin' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-undc-blue border border-blue-200">
                          <span className="size-1.5 rounded-full bg-undc-blue" />
                          Superadmin
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800 border border-cyan-200">
                          <span className="size-1.5 rounded-full bg-cyan-500" />
                          Admin
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
                          <span className="size-1.5 rounded-full bg-slate-400" />
                          Inactivo
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-500 font-medium">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-undc-blue hover:bg-blue-100 transition cursor-pointer"
                        onClick={() => handleEditUser(user)}
                      >
                        <Edit3 size={14} />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {loading && <p className="p-10 text-center text-slate-500">Cargando usuarios…</p>}
            {!loading && !visible.length && (
              <p className="p-10 text-center text-slate-500">No se encontraron usuarios.</p>
            )}
          </div>
        </section>
      </main>
    </AdminLayout>
  )
}
