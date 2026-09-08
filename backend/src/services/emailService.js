import nodemailer from 'nodemailer'

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  })
}

export async function sendApprovalEmail(participant) {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, reason: 'SMTP_NOT_CONFIGURED' }

  const safe = Object.fromEntries(Object.entries(participant).map(([key, value]) => [key, escapeHtml(value)]))
  const paymentMode = participant.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1'
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Facultad de Ingeniería UNDC <no-reply@undc.edu.pe>',
    to: participant.email,
    subject: 'Confirmación de inscripción — Curso Taller de Investigación Aplicada',
    text: `Estimado(a) ${participant.first_names} ${participant.last_names}:\n\nTu inscripción ha sido aprobada.\n\nDatos del participante:\nDNI: ${participant.dni}\nCorreo: ${participant.email}\nCelular: ${participant.phone}\nModalidad de pago: ${paymentMode}\nCurso: Curso Taller de Investigación Aplicada\nInicio: 20 de septiembre de 2026\nModalidad: Semipresencial\nHorario: domingos de 09:00 a 13:30\n\nFacultad de Ingeniería — Universidad Nacional de Cañete`,
    html: `<div style="font-family:Arial,sans-serif;color:#17314f;line-height:1.6;max-width:620px"><h2 style="color:#0b4d96">Inscripción confirmada</h2><p>Estimado(a) <strong>${safe.first_names} ${safe.last_names}</strong>:</p><p>Tu inscripción al <strong>Curso Taller de Investigación Aplicada</strong> ha sido aprobada.</p><h3>Datos del participante</h3><ul><li><strong>DNI:</strong> ${safe.dni}</li><li><strong>Correo:</strong> ${safe.email}</li><li><strong>Celular:</strong> ${safe.phone}</li><li><strong>Modalidad de pago:</strong> ${paymentMode}</li></ul><h3>Información del curso</h3><ul><li><strong>Inicio:</strong> 20 de septiembre de 2026</li><li><strong>Modalidad:</strong> Semipresencial</li><li><strong>Horario:</strong> domingos de 09:00 a 13:30</li></ul><p>Facultad de Ingeniería — Universidad Nacional de Cañete</p></div>`,
  })
  return { sent: true }
}
