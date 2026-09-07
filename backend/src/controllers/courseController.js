import { pool } from '../config/database.js'

export async function getActiveCourse(_req, res, next) {
  try {
    const [courses] = await pool.query(
      `SELECT id, name, faculty, registration_start, registration_end,
              course_start, modality, class_schedule, tutoring_hours,
              registration_fee, first_module_fee, schedule_document_url
       FROM courses WHERE is_active = 1 ORDER BY id DESC LIMIT 1`,
    )
    if (!courses.length) return res.status(404).json({ message: 'No hay un curso activo' })
    const [banks] = await pool.query(
      'SELECT name, account_number, cci FROM bank_accounts WHERE is_active = 1 ORDER BY id',
    )
    res.json({ data: { ...courses[0], banks } })
  } catch (error) { next(error) }
}
