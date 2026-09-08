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
  const [registrationColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'registrations'`,
    [databaseName],
  )
  const columnNames = new Set(registrationColumns.map((column) => column.COLUMN_NAME))
  if (!columnNames.has('observation_text')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN observation_text TEXT NULL`)
  if (!columnNames.has('correction_token_hash')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN correction_token_hash CHAR(64) NULL UNIQUE`)
  if (!columnNames.has('payment_mode')) await connection.query(`ALTER TABLE \`${databaseName}\`.registrations ADD COLUMN payment_mode ENUM('option1', 'option2') NOT NULL DEFAULT 'option1' AFTER phone`)
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@undc.edu.pe').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin12345!'
  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await connection.query(
    `INSERT INTO \`${databaseName}\`.administrators (name, email, password_hash)
     VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    ['Administrador UNDC', adminEmail, passwordHash],
  )
  console.log('Base de datos configurada correctamente')
  console.log(`Usuario administrativo: ${adminEmail}`)
} finally {
  await connection.end()
}
