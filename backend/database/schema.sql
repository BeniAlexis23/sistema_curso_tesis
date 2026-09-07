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

CREATE TABLE IF NOT EXISTS administrators (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
