import { pool } from '../config/database.js'
import { createPaymentSchedule } from '../services/paymentSchedule.js'

async function ensureSchedules() {
  const [registrations] = await pool.query(
    `SELECT r.id, r.payment_mode FROM registrations r
     LEFT JOIN registration_payments p ON p.registration_id = r.id
     GROUP BY r.id HAVING COUNT(p.id) = 0`,
  )
  for (const registration of registrations) {
    await createPaymentSchedule(pool, registration.id, registration.payment_mode)
  }
}

export async function listPayments(_req, res, next) {
  try {
    await ensureSchedules()
    const [rows] = await pool.query(
      `SELECT r.id AS registration_id, r.first_names, r.last_names, r.dni, r.email, r.phone,
              r.payment_mode, p.id AS payment_id, p.installment_order, p.concept, p.amount,
              p.due_date, p.status AS payment_status, p.paid_at, p.notes
       FROM registrations r
       JOIN registration_payments p ON p.registration_id = r.id
       ORDER BY r.created_at DESC, p.installment_order ASC`,
    )
    res.json({ data: rows })
  } catch (error) { next(error) }
}

export async function updatePayment(req, res, next) {
  try {
    const { status, paidAt, notes } = req.body
    if (!['pending', 'paid'].includes(status)) return res.status(400).json({ message: 'Estado de pago no válido' })
    const normalizedPaidAt = status === 'paid' ? (paidAt || new Date().toISOString().slice(0, 10)) : null
    const [result] = await pool.query(
      `UPDATE registration_payments SET status = ?, paid_at = ?, notes = ? WHERE id = ?`,
      [status, normalizedPaidAt, notes?.trim() || null, req.params.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Pago no encontrado' })
    res.json({ message: 'Pago actualizado correctamente' })
  } catch (error) { next(error) }
}
