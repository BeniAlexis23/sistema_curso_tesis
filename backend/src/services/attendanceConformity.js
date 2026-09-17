export async function getAttendanceConformity(connection, courseId = null) {
  const [rows] = courseId
    ? await connection.query(
      'SELECT id AS course_id, attendance_conformity_at FROM courses WHERE id = ? LIMIT 1',
      [courseId],
    )
    : await connection.query(
      'SELECT id AS course_id, attendance_conformity_at FROM courses WHERE is_active = 1 ORDER BY id LIMIT 1',
    )
  return rows[0] || { course_id: null, attendance_conformity_at: null }
}

export async function setActiveAttendanceConformity(connection, enabled) {
  const [result] = await connection.query(
    `UPDATE courses
     SET attendance_conformity_at = ${enabled ? 'DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)' : 'NULL'}
     WHERE is_active = 1 ORDER BY id LIMIT 1`,
  )
  if (!result.affectedRows) return null
  return getAttendanceConformity(connection)
}

export async function clearAttendanceConformityForSession(connection, sessionId) {
  await connection.query(
    `UPDATE courses c
     JOIN course_modules m ON m.course_id = c.id
     JOIN module_sessions s ON s.module_id = m.id
     SET c.attendance_conformity_at = NULL
     WHERE s.id = ? AND c.attendance_conformity_at IS NOT NULL`,
    [sessionId],
  )
}

export async function clearAttendanceConformityForModule(connection, moduleId) {
  await connection.query(
    `UPDATE courses c
     JOIN course_modules m ON m.course_id = c.id
     SET c.attendance_conformity_at = NULL
     WHERE m.id = ? AND c.attendance_conformity_at IS NOT NULL`,
    [moduleId],
  )
}
