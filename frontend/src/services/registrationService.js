const API_URL = import.meta.env.VITE_API_URL || '/api'

export async function createRegistration(formData) {
  const response = await fetch(`${API_URL}/registrations`, { method: 'POST', body: formData })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || 'No se pudo registrar la inscripción')
  return result
}
