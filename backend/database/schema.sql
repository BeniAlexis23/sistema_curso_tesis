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
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_administrator_role FOREIGN KEY (role_id) REFERENCES roles(id)
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

INSERT INTO roles (id, name, description, is_system, is_active)
VALUES (1, 'Super Administrador', 'Acceso completo a todos los módulos y configuraciones del sistema.', TRUE, TRUE)
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_system = TRUE, is_active = TRUE;

INSERT INTO permissions (code, name, description, module) VALUES
  ('registrations.view', 'Ver inscripciones', 'Consultar inscripciones y sus documentos.', 'Inscripciones'),
  ('registrations.manage', 'Gestionar inscripciones', 'Editar datos, documentos y estados de inscripción.', 'Inscripciones'),
  ('registrations.delete', 'Eliminar inscripciones', 'Eliminar inscripciones, pagos y documentos asociados.', 'Inscripciones'),
  ('payments.view', 'Ver pagos', 'Consultar cronogramas y estados de pago.', 'Pagos'),
  ('payments.manage', 'Gestionar pagos', 'Registrar o revertir pagos y sus observaciones.', 'Pagos'),
  ('reports.view', 'Ver reportes', 'Consultar el reporte consolidado.', 'Reportes'),
  ('reports.export', 'Exportar reportes', 'Descargar reportes en PDF y Excel.', 'Reportes'),
  ('users.view', 'Ver usuarios', 'Consultar usuarios administrativos.', 'Seguridad'),
  ('users.manage', 'Gestionar usuarios', 'Crear, editar, activar, desactivar y eliminar usuarios.', 'Seguridad'),
  ('roles.view', 'Ver roles y permisos', 'Consultar roles y el catálogo de permisos.', 'Seguridad'),
  ('roles.manage', 'Gestionar roles y permisos', 'Crear, editar y eliminar roles y asignar sus permisos.', 'Seguridad')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), module = VALUES(module);

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;
