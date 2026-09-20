CREATE DATABASE IF NOT EXISTS curso_investigacion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE curso_investigacion;

CREATE TABLE IF NOT EXISTS courses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  faculty VARCHAR(120) NOT NULL,
  registration_start DATE NOT NULL,
  registration_end DATE NOT NULL,
  course_start DATE NOT NULL,
  modality VARCHAR(50) NOT NULL,
  class_schedule VARCHAR(120) NOT NULL,
  tutoring_hours TINYINT UNSIGNED NOT NULL,
  registration_fee DECIMAL(10,2) NOT NULL,
  first_module_fee DECIMAL(10,2) NOT NULL,
  schedule_document_url VARCHAR(500) NULL,
  attendance_conformity_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  account_number VARCHAR(40) NOT NULL,
  cci VARCHAR(40) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS registrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  first_names VARCHAR(120) NOT NULL,
  last_names VARCHAR(120) NOT NULL,
  dni CHAR(8) NOT NULL,
  email VARCHAR(180) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  payment_mode ENUM('option1', 'option2') NOT NULL,
  status ENUM('pending', 'approved', 'observed', 'rejected') NOT NULL DEFAULT 'pending',
  observation_text TEXT NULL,
  correction_token_hash CHAR(64) NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_registration_course FOREIGN KEY (course_id) REFERENCES courses(id),
  UNIQUE KEY uq_registration_course_dni (course_id, dni),
  UNIQUE KEY uq_registration_course_email (course_id, email)
);

CREATE TABLE IF NOT EXISTS registration_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  registration_id INT UNSIGNED NOT NULL,
  document_type ENUM('bachelorDiploma', 'suneduRegistration', 'futRequest', 'paymentVoucher') NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_registration FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_registration_document (registration_id, document_type)
);

CREATE TABLE IF NOT EXISTS registration_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  registration_id INT UNSIGNED NOT NULL,
  installment_order TINYINT UNSIGNED NOT NULL,
  concept VARCHAR(120) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  paid_at DATE NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_registration FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_registration_installment (registration_id, installment_order)
);

CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL,
  module VARCHAR(80) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS administrators (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id INT UNSIGNED NOT NULL DEFAULT 1,
  name VARCHAR(120) NOT NULL,
  last_names VARCHAR(120) NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_administrator_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE TABLE IF NOT EXISTS course_modules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id INT UNSIGNED NOT NULL,
  module_number TINYINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  teacher_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_module_course FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_course_module_teacher FOREIGN KEY (teacher_id) REFERENCES administrators(id) ON DELETE SET NULL,
  UNIQUE KEY uq_course_module_number (course_id, module_number)
);

CREATE TABLE IF NOT EXISTS module_sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  module_id INT UNSIGNED NOT NULL,
  session_number TINYINT UNSIGNED NOT NULL,
  topic VARCHAR(500) NOT NULL,
  modality ENUM('in_person', 'synchronous') NOT NULL,
  scheduled_start DATETIME NOT NULL,
  scheduled_end DATETIME NOT NULL,
  teacher_id INT UNSIGNED NULL,
  check_in_opens_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 60,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_module_session_module FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE,
  CONSTRAINT fk_module_session_teacher FOREIGN KEY (teacher_id) REFERENCES administrators(id),
  UNIQUE KEY uq_module_session_number (module_id, session_number)
);

CREATE TABLE IF NOT EXISTS teacher_attendances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  check_in_at DATETIME NOT NULL,
  check_out_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_teacher_attendance_session FOREIGN KEY (session_id) REFERENCES module_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_teacher_attendance_teacher FOREIGN KEY (teacher_id) REFERENCES administrators(id),
  UNIQUE KEY uq_teacher_attendance_session (session_id)
);

CREATE TABLE IF NOT EXISTS staff_attendances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  administrator_id INT UNSIGNED NOT NULL,
  check_in_at DATETIME NOT NULL,
  check_out_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_staff_attendance_session FOREIGN KEY (session_id) REFERENCES module_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_staff_attendance_administrator FOREIGN KEY (administrator_id) REFERENCES administrators(id),
  UNIQUE KEY uq_staff_attendance_session_administrator (session_id, administrator_id)
);

CREATE TABLE IF NOT EXISTS registration_attendances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  registration_id INT UNSIGNED NOT NULL,
  status ENUM('present', 'absent') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_registration_attendance_session FOREIGN KEY (session_id) REFERENCES module_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_attendance_registration FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
  UNIQUE KEY uq_registration_attendance_session_registration (session_id, registration_id)
);

INSERT INTO courses (name, faculty, registration_start, registration_end, course_start, modality, class_schedule, tutoring_hours, registration_fee, first_module_fee)
SELECT 'Curso Taller de Investigación Aplicada', 'Facultad de Ingeniería', '2026-09-14', '2026-09-18', '2026-09-20', 'Semipresencial', 'Domingos, 09:00 - 13:30', 4, 700.00, 850.00
WHERE NOT EXISTS (SELECT 1 FROM courses);

INSERT INTO bank_accounts (name, account_number, cci)
SELECT 'Banco de la Nación', '00-571-028409', '018-57100057102840901'
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE name = 'Banco de la Nación');

INSERT INTO bank_accounts (name, account_number, cci)
SELECT 'Banco Interbank', '4013004527840', NULL
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE name = 'Banco Interbank');

INSERT IGNORE INTO roles (id, name, description, is_system, is_active)
VALUES (1, 'Super Administrador', 'Acceso completo a todos los módulos y configuraciones del sistema.', TRUE, TRUE);

INSERT IGNORE INTO roles (name, description, is_system, is_active)
VALUES ('Docente', 'Marca su entrada y salida y registra la asistencia de estudiantes en sus sesiones.', TRUE, TRUE);

INSERT IGNORE INTO roles (name, description, is_system, is_active) VALUES
  ('Coordinador general', 'Registra su entrada y salida en las sesiones del curso.', TRUE, TRUE),
  ('Coordinador académico', 'Registra su entrada y salida en las sesiones del curso.', TRUE, TRUE),
  ('Asistente administrativo', 'Registra su entrada y salida en las sesiones del curso.', TRUE, TRUE),
  ('Soporte informático', 'Registra su entrada y salida en las sesiones del curso.', TRUE, TRUE);

INSERT IGNORE INTO permissions (code, name, description, module) VALUES
  ('registrations.view', 'Ver inscripciones', 'Consultar inscripciones y documentos enviados.', 'Inscripciones'),
  ('registrations.manage', 'Gestionar inscripciones', 'Editar inscripciones, documentos y estados.', 'Inscripciones'),
  ('registrations.delete', 'Eliminar inscripciones', 'Eliminar una inscripción con sus pagos y documentos.', 'Inscripciones'),
  ('payments.view', 'Ver pagos', 'Consultar cuotas, vencimientos y pagos.', 'Pagos'),
  ('payments.manage', 'Gestionar pagos', 'Marcar pagos como pagados o pendientes y editar notas.', 'Pagos'),
  ('reports.view', 'Ver reportes', 'Consultar el resumen de inscripciones y pagos.', 'Reportes'),
  ('reports.export', 'Exportar reportes', 'Descargar el resumen de inscripciones y pagos en PDF o Excel.', 'Reportes'),
  ('users.view', 'Ver usuarios', 'Consultar usuarios del panel administrativo.', 'Seguridad'),
  ('users.manage', 'Gestionar usuarios', 'Crear, editar, activar, desactivar o eliminar usuarios.', 'Seguridad'),
  ('roles.view', 'Ver roles y permisos', 'Consultar roles y permisos disponibles.', 'Seguridad'),
  ('roles.manage', 'Gestionar roles y permisos', 'Crear, editar o eliminar roles y asignar permisos.', 'Seguridad'),
  ('attendance.view', 'Ver asistencia docente', 'Consultar sesiones asignadas y marcas de entrada y salida; con gestión, todas.', 'Asistencia docente'),
  ('attendance.mark', 'Marcar asistencia propia', 'Registrar mi entrada y salida en las sesiones asignadas.', 'Asistencia docente'),
  ('attendance.manage', 'Gestionar asistencia docente', 'Asignar docentes, configurar sesiones y editar entradas y salidas.', 'Asistencia docente'),
  ('attendance.export', 'Exportar asistencia docente', 'Descargar asistencias docentes de todos los módulos en PDF o Excel.', 'Asistencia docente'),
  ('attendance.approve', 'Dar conformidad a asistencias', 'Activar o retirar la conformidad del decano que aparece en los PDF de asistencia.', 'Asistencias'),
  ('staff_attendance.view', 'Ver asistencia del personal', 'Consultar mis entradas y salidas por sesión; con exportación, las de todo el personal.', 'Asistencia del personal'),
  ('staff_attendance.mark', 'Marcar asistencia del personal', 'Registrar mi propia entrada y salida en cada sesión.', 'Asistencia del personal'),
  ('staff_attendance.manage', 'Gestionar asistencia del personal', 'Consultar y corregir las horas registradas por el personal.', 'Asistencia del personal'),
  ('staff_attendance.export', 'Exportar asistencia del personal', 'Descargar la asistencia del personal de todas las sesiones en PDF o Excel.', 'Asistencia del personal'),
  ('registration_attendance.view', 'Ver asistencia de estudiantes', 'Consultar Presente o Ausente por sesión asignada; con gestión o exportación, todas.', 'Asistencia de estudiantes'),
  ('registration_attendance.mark', 'Registrar asistencia de estudiantes', 'Guardar y editar Presente o Ausente en las sesiones asignadas.', 'Asistencia de estudiantes'),
  ('registration_attendance.export', 'Exportar asistencia de estudiantes', 'Descargar asistencias guardadas de cualquier sesión en PDF o Excel.', 'Asistencia de estudiantes');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code <> 'staff_attendance.mark';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN ('attendance.view', 'attendance.mark', 'registration_attendance.view', 'registration_attendance.mark')
WHERE r.name = 'Docente';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN ('staff_attendance.view', 'staff_attendance.mark')
WHERE r.name IN ('Coordinador general', 'Coordinador académico', 'Asistente administrativo', 'Soporte informático');

INSERT IGNORE INTO course_modules (course_id, module_number, name)
SELECT c.id, module_data.module_number, module_data.name
FROM (SELECT id FROM courses ORDER BY id LIMIT 1) c
CROSS JOIN (
  SELECT 1 AS module_number, 'Primer módulo' AS name
  UNION ALL SELECT 2, 'Segundo módulo'
  UNION ALL SELECT 3, 'Tercer módulo'
) module_data;

INSERT IGNORE INTO module_sessions
  (module_id, session_number, topic, modality, scheduled_start, scheduled_end)
SELECT m.id, session_data.session_number, session_data.topic, session_data.modality,
       session_data.scheduled_start, session_data.scheduled_end
FROM course_modules m
JOIN (SELECT id FROM courses ORDER BY id LIMIT 1) c ON c.id = m.course_id
JOIN (
  SELECT 1 AS module_number, 1 AS session_number, 'Situación problemática, variables, problema, objetivos e hipótesis' AS topic, 'in_person' AS modality, '2026-09-20 09:00:00' AS scheduled_start, '2026-09-20 13:30:00' AS scheduled_end
  UNION ALL SELECT 1, 2, 'Antecedentes, bases teóricas y diseño metodológico', 'synchronous', '2026-09-27 09:00:00', '2026-09-27 13:30:00'
  UNION ALL SELECT 1, 3, 'Técnicas, instrumentos, cronograma, presupuesto y financiamiento', 'synchronous', '2026-10-03 09:00:00', '2026-10-03 13:30:00'
  UNION ALL SELECT 1, 4, 'Coordinación especializada de la propuesta de investigación', 'synchronous', '2026-10-11 09:00:00', '2026-10-11 13:30:00'
  UNION ALL SELECT 2, 1, 'Técnicas e instrumentos para la recolección de datos', 'in_person', '2026-10-18 09:00:00', '2026-10-18 13:30:00'
  UNION ALL SELECT 2, 2, 'Análisis, procesamiento de datos y presentación de resultados', 'synchronous', '2026-10-25 09:00:00', '2026-10-25 13:30:00'
  UNION ALL SELECT 2, 3, 'Estadística aplicada a la investigación', 'synchronous', '2026-11-01 09:00:00', '2026-11-01 13:30:00'
  UNION ALL SELECT 2, 4, 'Análisis de resultados y prueba de hipótesis', 'in_person', '2026-11-08 09:00:00', '2026-11-08 13:30:00'
  UNION ALL SELECT 3, 1, 'Redacción del informe final', 'in_person', '2026-11-15 09:00:00', '2026-11-15 13:30:00'
  UNION ALL SELECT 3, 2, 'Elaboración de artículo', 'synchronous', '2026-11-22 09:00:00', '2026-11-22 13:30:00'
  UNION ALL SELECT 3, 3, 'Búsqueda de revista indexada para publicación del artículo', 'synchronous', '2026-11-29 09:00:00', '2026-11-29 13:30:00'
  UNION ALL SELECT 3, 4, 'Presentación del informe final y artículo de investigación', 'in_person', '2026-12-06 09:00:00', '2026-12-06 13:30:00'
) session_data ON session_data.module_number = m.module_number;
