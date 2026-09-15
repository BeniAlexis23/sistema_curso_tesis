import 'dotenv/config'
import fs from 'node:fs/promises'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8')
const databaseName = process.env.DB_NAME || 'curso_investigacion'
if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) throw new Error('DB_NAME contiene caracteres no válidos')

const serverConnection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
})
try {
  await serverConnection.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
} catch (error) {
  if (!['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR'].includes(error.code)) throw error
} finally {
  await serverConnection.end()
}

const schemaSql = sql
  .replace(/CREATE DATABASE[\s\S]*?;/i, '')
  .replace(/USE\s+[a-zA-Z0-9_]+\s*;/i, '')
const connection = await mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: databaseName,
  multipleStatements: true,
})

try {
  await connection.query(schemaSql)

  const [administratorColumns] = await connection.query(
    `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'administrators'`,
    [databaseName],
  )
  const administratorColumnsByName = new Map(
    administratorColumns.map((column) => [column.COLUMN_NAME, column]),
  )
  const roleIdColumn = administratorColumnsByName.get('role_id')
  if (!roleIdColumn) {
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.administrators
       ADD COLUMN role_id INT UNSIGNED NULL AFTER id`,
    )
  }

  const [administratorRoleForeignKeys] = await connection.query(
    `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'administrators'
       AND COLUMN_NAME = 'role_id' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [databaseName],
  )
  const validAdministratorRoleForeignKeys = administratorRoleForeignKeys.filter((foreignKey) => (
    foreignKey.REFERENCED_TABLE_NAME === 'roles' && foreignKey.REFERENCED_COLUMN_NAME === 'id'
  ))
  const invalidAdministratorRoleForeignKeys = administratorRoleForeignKeys.filter((foreignKey) => (
    foreignKey.REFERENCED_TABLE_NAME !== 'roles' || foreignKey.REFERENCED_COLUMN_NAME !== 'id'
  ))
  if (invalidAdministratorRoleForeignKeys.length) {
    throw new Error('administrators.role_id tiene una clave foranea distinta de roles.id')
  }
  let needsAdministratorRoleForeignKey = validAdministratorRoleForeignKeys.length === 0

  // Los administradores anteriores al modulo de roles tenian acceso total.
  // Tambien corrige valores 0 o roles inexistentes de instalaciones actualizadas manualmente.
  await connection.query(
    `UPDATE \`${databaseName}\`.administrators a
     LEFT JOIN \`${databaseName}\`.roles r ON r.id = a.role_id
     SET a.role_id = 1
     WHERE a.role_id IS NULL OR r.id IS NULL`,
  )

  const roleIdNeedsNormalization = !roleIdColumn || (
    roleIdColumn.DATA_TYPE !== 'int'
    || !roleIdColumn.COLUMN_TYPE.toLowerCase().includes('unsigned')
    || roleIdColumn.IS_NULLABLE !== 'NO'
    || String(roleIdColumn.COLUMN_DEFAULT) !== '1'
  )
  if (roleIdNeedsNormalization) {
    for (const foreignKey of validAdministratorRoleForeignKeys) {
      const foreignKeyName = String(foreignKey.CONSTRAINT_NAME)
      if (!/^[a-zA-Z0-9_$]+$/.test(foreignKeyName)) {
        throw new Error('administrators.role_id tiene una clave foranea con nombre no valido')
      }
      await connection.query(
        `ALTER TABLE \`${databaseName}\`.administrators DROP FOREIGN KEY \`${foreignKeyName}\``,
      )
      needsAdministratorRoleForeignKey = true
    }
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.administrators
       MODIFY COLUMN role_id INT UNSIGNED NOT NULL DEFAULT 1`,
    )
  }

  if (needsAdministratorRoleForeignKey) {
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.administrators
       ADD CONSTRAINT fk_administrator_role FOREIGN KEY (role_id) REFERENCES roles(id)`,
    )
  }

  const updatedAtColumn = administratorColumnsByName.get('updated_at')
  if (!updatedAtColumn) {
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.administrators
       ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`,
    )
  } else {
    const hasCurrentTimestampDefault = /^current_timestamp(?:\(\))?$/i.test(String(updatedAtColumn.COLUMN_DEFAULT))
    const updatesAutomatically = /on update current_timestamp/i.test(updatedAtColumn.EXTRA)
    if (updatedAtColumn.DATA_TYPE !== 'timestamp' || !hasCurrentTimestampDefault || !updatesAutomatically) {
      await connection.query(
        `ALTER TABLE \`${databaseName}\`.administrators
         MODIFY COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
      )
    }
  }

  if (!administratorColumnsByName.has('last_names')) {
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.administrators
       ADD COLUMN last_names VARCHAR(120) NULL AFTER name`,
    )
  }

  // Retira estructuras de asistencia descartadas por los requerimientos finales.
  await connection.query(`DROP TABLE IF EXISTS ${databaseName}.attendance_corrections`)
  const [moduleSessionColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'module_sessions'`,
    [databaseName],
  )
  if (moduleSessionColumns.some((column) => column.COLUMN_NAME === 'late_tolerance_minutes')) {
    await connection.query(
      `ALTER TABLE ${databaseName}.module_sessions DROP COLUMN late_tolerance_minutes`,
    )
  }

  const [registrationColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registrations'`,
    [databaseName],
  )
  const columnNames = new Set(registrationColumns.map((column) => column.COLUMN_NAME))
  if (!columnNames.has('observation_text')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN observation_text TEXT NULL`)
  if (!columnNames.has('correction_token_hash')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN correction_token_hash CHAR(64) NULL UNIQUE`)
  if (!columnNames.has('payment_mode')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN payment_mode ENUM('option1', 'option2') NOT NULL DEFAULT 'option1' AFTER phone`)
  // Estos conceptos vencen el mismo día en la opción 1 y forman una sola cuota.
  await connection.query(
    `UPDATE registration_payments p2
     JOIN registrations r ON r.id = p2.registration_id AND r.payment_mode = 'option1'
     LEFT JOIN registration_payments p3 ON p3.registration_id = p2.registration_id AND p3.installment_order = 3 AND p3.concept = 'II módulo'
     SET p2.concept = 'Tutoría especializada + II módulo', p2.amount = 1600.00,
         p2.status = IF(p3.id IS NOT NULL AND p2.status = 'paid' AND p3.status = 'paid', 'paid', p2.status),
         p2.paid_at = IF(p3.id IS NOT NULL AND p2.status = 'paid' AND p3.status = 'paid', COALESCE(p3.paid_at, p2.paid_at), p2.paid_at)
     WHERE p2.installment_order = 2 AND p2.concept = 'Tutoría especializada'`,
  )
  await connection.query(
    `DELETE p3 FROM registration_payments p3
     JOIN registrations r ON r.id = p3.registration_id AND r.payment_mode = 'option1'
     WHERE p3.installment_order = 3 AND p3.concept = 'II módulo'`,
  )
  await connection.query(
    `UPDATE registration_payments p
     JOIN registrations r ON r.id = p.registration_id AND r.payment_mode = 'option1'
     SET p.installment_order = 3 WHERE p.installment_order = 4 AND p.concept = 'III módulo'`,
  )
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@undc.edu.pe').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin12345!'
  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await connection.query(
    `INSERT INTO \`${databaseName}\`.administrators (role_id, name, email, password_hash)
     VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE
       name = VALUES(name), password_hash = VALUES(password_hash)`,
    ['Administrador UNDC', adminEmail, passwordHash],
  )
  console.log('Base de datos configurada correctamente')
  console.log(`Usuario administrativo: ${adminEmail}`)
} finally {
  await connection.end()
}
