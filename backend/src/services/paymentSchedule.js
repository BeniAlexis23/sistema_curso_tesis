const schedules = {
  option1: [
    ['Inscripción + I módulo', 1550, '2026-09-19'],
    ['Tutoría especializada', 750, '2026-10-18'],
    ['II módulo', 850, '2026-10-18'],
    ['III módulo', 850, '2026-11-15'],
  ],
  option2: [
    ['Inscripción', 700, '2026-09-19'],
    ['I módulo', 1100, '2026-10-11'],
    ['II módulo', 1100, '2026-11-08'],
    ['III módulo', 1100, '2026-12-04'],
  ],
}

export async function createPaymentSchedule(connection, registrationId, paymentMode) {
  const schedule = schedules[paymentMode] || schedules.option1
  const values = schedule.map(([concept, amount, dueDate], index) => [registrationId, index + 1, concept, amount, dueDate])
  await connection.query(
    `INSERT IGNORE INTO registration_payments
      (registration_id, installment_order, concept, amount, due_date) VALUES ?`,
    [values],
  )
}

export async function replacePaymentSchedule(connection, registrationId, paymentMode) {
  await connection.query('DELETE FROM registration_payments WHERE registration_id = ?', [registrationId])
  await createPaymentSchedule(connection, registrationId, paymentMode)
}
