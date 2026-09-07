const API_URL = import.meta.env.VITE_API_URL || '/api'

export async function getActiveCourse() {
  const response = await fetch(`${API_URL}/courses/active`)
  if (!response.ok) throw new Error('No se pudo cargar la información del curso')
  return response.json()
}
