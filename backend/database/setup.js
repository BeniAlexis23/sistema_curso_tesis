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

  const [courseColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses'`,
    [databaseName],
  )
  if (!courseColumns.some((column) => column.COLUMN_NAME === 'attendance_conformity_at')) {
    await connection.query(
      `ALTER TABLE \`${databaseName}\`.courses
       ADD COLUMN attendance_conformity_at DATETIME NULL AFTER schedule_document_url`,
    )
  }

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

  // Nunca corrige filas existentes automáticamente. Si una instalación antigua
  // contiene usuarios sin un rol válido, se detiene para que se revise de forma explícita.
  const [[invalidAdministratorRoles]] = await connection.query(
    `SELECT COUNT(*) AS invalid_count
     FROM \`${databaseName}\`.administrators a
     LEFT JOIN \`${databaseName}\`.roles r ON r.id = a.role_id
     WHERE a.role_id IS NULL OR r.id IS NULL`,
  )
  if (Number(invalidAdministratorRoles.invalid_count)) {
    throw new Error('Existen administradores sin un rol válido; no se modificó ningún registro')
  }

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

  const [registrationColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registrations'`,
    [databaseName],
  )
  const columnNames = new Set(registrationColumns.map((column) => column.COLUMN_NAME))
  if (!columnNames.has('observation_text')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN observation_text TEXT NULL`)
  if (!columnNames.has('correction_token_hash')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN correction_token_hash CHAR(64) NULL UNIQUE`)
  if (!columnNames.has('payment_mode')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN payment_mode ENUM('option1', 'option2') NOT NULL DEFAULT 'option1' AFTER phone`)

  // El setup de producción es estrictamente aditivo: nunca elimina tablas,
  // columnas ni registros existentes. Las migraciones históricas que
  // consolidaban cuotas ya se aplicaron en la versión base de producción.
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@undc.edu.pe').toLowerCase()
  const [[existingAdministrator]] = await connection.query(
    `SELECT id FROM \`${databaseName}\`.administrators WHERE email = ? LIMIT 1`,
    [adminEmail],
  )
  if (!existingAdministrator) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin12345!'
    const passwordHash = await bcrypt.hash(adminPassword, 12)
    await connection.query(
      `INSERT IGNORE INTO \`${databaseName}\`.administrators (role_id, name, email, password_hash)
       VALUES (1, ?, ?, ?)`,
      ['Administrador UNDC', adminEmail, passwordHash],
    )
  }

  const requiredSchema = {
    courses: ['id', 'attendance_conformity_at'],
    registrations: ['id', 'course_id', 'payment_mode', 'status'],
    registration_documents: ['id', 'registration_id'],
    registration_payments: ['id', 'registration_id', 'status'],
    roles: ['id', 'name'],
    permissions: ['id', 'code'],
    role_permissions: ['role_id', 'permission_id'],
    administrators: ['id', 'role_id', 'name', 'last_names', 'email', 'password_hash'],
    course_modules: ['id', 'course_id', 'module_number', 'teacher_id'],
    module_sessions: ['id', 'module_id', 'session_number', 'teacher_id', 'check_in_opens_minutes'],
    teacher_attendances: ['id', 'session_id', 'teacher_id', 'check_in_at', 'check_out_at'],
    staff_attendances: ['id', 'session_id', 'administrator_id', 'check_in_at', 'check_out_at'],
    registration_attendances: ['id', 'session_id', 'registration_id', 'status'],
  }
  const [installedColumns] = await connection.query(
    `SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ?`,
    [databaseName],
  )
  const installedSchema = new Map()
  for (const column of installedColumns) {
    if (!installedSchema.has(column.TABLE_NAME)) installedSchema.set(column.TABLE_NAME, new Set())
    installedSchema.get(column.TABLE_NAME).add(column.COLUMN_NAME)
  }
  const missingSchema = []
  for (const [table, columns] of Object.entries(requiredSchema)) {
    for (const column of columns) {
      if (!installedSchema.get(table)?.has(column)) missingSchema.push(`${table}.${column}`)
    }
  }
  if (missingSchema.length) {
    throw new Error(`La actualización de la base de datos quedó incompleta: ${missingSchema.join(', ')}`)
  }

  const requiredPermissionCodes = [
    'registrations.view', 'registrations.manage', 'registrations.delete',
    'payments.view', 'payments.manage', 'reports.view', 'reports.export',
    'users.view', 'users.manage', 'roles.view', 'roles.manage',
    'attendance.view', 'attendance.mark', 'attendance.manage', 'attendance.export',
    'attendance.approve', 'registration_attendance.view',
    'registration_attendance.mark', 'registration_attendance.export',
    'staff_attendance.view', 'staff_attendance.mark', 'staff_attendance.manage', 'staff_attendance.export',
  ]
  const [installedPermissions] = await connection.query(
    'SELECT code FROM permissions WHERE code IN (?)',
    [requiredPermissionCodes],
  )
  const installedPermissionCodes = new Set(installedPermissions.map(permission => permission.code))
  const missingPermissions = requiredPermissionCodes.filter(code => !installedPermissionCodes.has(code))
  if (missingPermissions.length) {
    throw new Error(`No se instalaron todos los permisos requeridos: ${missingPermissions.join(', ')}`)
  }

  const [[systemRoles]] = await connection.query(
    `SELECT
       SUM(id = 1 AND name = 'Super Administrador' AND is_system = 1 AND is_active = 1) AS super_admin,
       SUM(name = 'Docente' AND is_system = 1 AND is_active = 1) AS teacher,
       SUM(name = 'Coordinador general' AND is_system = 1 AND is_active = 1) AS general_coordinator,
       SUM(name = 'Coordinador académico' AND is_system = 1 AND is_active = 1) AS academic_coordinator,
       SUM(name = 'Asistente administrativo' AND is_system = 1 AND is_active = 1) AS administrative_assistant,
       SUM(name = 'Soporte informático' AND is_system = 1 AND is_active = 1) AS technical_support
     FROM roles`,
  )
  if (!Number(systemRoles.super_admin) || !Number(systemRoles.teacher)
      || !Number(systemRoles.general_coordinator) || !Number(systemRoles.academic_coordinator)
      || !Number(systemRoles.administrative_assistant) || !Number(systemRoles.technical_support)) {
    throw new Error('Los roles del sistema no quedaron configurados correctamente')
  }

  const [staffRolePermissions] = await connection.query(
    `SELECT r.name, COUNT(DISTINCT p.code) AS permission_count
     FROM roles r
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN permissions p ON p.id = rp.permission_id
       AND p.code IN ('staff_attendance.view', 'staff_attendance.mark')
     WHERE r.name IN ('Coordinador general', 'Coordinador académico', 'Asistente administrativo', 'Soporte informático')
     GROUP BY r.id, r.name`,
  )
  if (staffRolePermissions.length !== 4
      || staffRolePermissions.some(role => Number(role.permission_count) !== 2)) {
    throw new Error('Los roles del personal no recibieron sus permisos de asistencia')
  }

  const superAdminPermissionCodes = requiredPermissionCodes.filter(code => code !== 'staff_attendance.mark')
  const [[{ superAdminPermissionCount }]] = await connection.query(
    `SELECT COUNT(DISTINCT p.code) AS superAdminPermissionCount
     FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = 1 AND p.code IN (?)`,
    [superAdminPermissionCodes],
  )
  if (Number(superAdminPermissionCount) !== superAdminPermissionCodes.length) {
    throw new Error('El Super Administrador no recibió todos los permisos requeridos')
  }

  console.log('Base de datos configurada correctamente')
  console.log(`Usuario administrativo: ${adminEmail}`)
} finally {
  await connection.end()
}
