import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";

export default function CourseSummary({ course }) {
  return (
    <section className="summary-grid">
      <div className="summary-card accent">
        <CalendarDays />
        <small>INICIO</small>
        <strong>20 SET 2026</strong>
      </div>
      <div className="summary-card">
        <MapPin />
        <small>MODALIDAD</small>
        <strong>{course.modality.toUpperCase()}</strong>
      </div>
      <div className="summary-card">
        <Clock3 />
        <small>CLASES</small>
        <strong>DOM · 09:00 — 13:30</strong>
      </div>
      <div className="summary-card">
        <Users />
        <small>TUTORÍAS</small>
        <strong>{course.tutoring_hours} HORAS PEDAGÓGICAS</strong>
        <span>Durante la semana</span>
      </div>
    </section>
  );
}
