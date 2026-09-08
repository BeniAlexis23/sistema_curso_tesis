import {
  ArrowRight,
  CalendarDays,
  Clock3,
  MapPin,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import Shell from "../components/Shell";

export default function HomePage() {
  return (
    <Shell>
      <main className="hero -mt-25">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />
        <section className="hero-copy">
          <div className="eyebrow">
            <span /> Facultad de Ingeniería · UNDC
          </div>
          <h1>
            Curso Taller de
            <br />
            <em>Investigación Aplicada</em>
          </h1>
          <p className="lede">
            Convierte tu experiencia profesional en una investigación rigurosa,
            relevante y lista para generar impacto.
          </p>
          <div className="actions">
            <Link className="primary-button" to="/informacion">
              Inscribirme ahora <ArrowRight size={19} />
            </Link>
            <span className="secure">
              <ShieldCheck size={18} /> Proceso seguro y guiado
            </span>
          </div>
        </section>
        <aside className="date-card">
          <div className="date-card-top">
            <CalendarDays size={21} />
            <span>PERIODO DE INSCRIPCIÓN</span>
          </div>
          <div className="date-range">
            <strong>07</strong>
            <div className="text-4xl font-bold">AL</div>
            <strong>19</strong>
          </div>
          <div className="month">SEPTIEMBRE · 2026</div>
          <div className="card-rule" />
          <div className="start-row">
            <div>
              <small>INICIO DE CLASES</small>
              <b>20 de septiembre</b>
            </div>
            <span>Dom</span>
          </div>
        </aside>
        <div className="hero-facts">
          <div>
            <Clock3 />
            <span>
              <small>HORARIO</small>
              <b>
                Domingos
                <br />
                09:00 — 13:30
              </b>
            </span>
          </div>
          <div>
            <MapPin />
            <span>
              <small>MODALIDAD</small>
              <b>Semipresencial</b>
            </span>
          </div>
          <div>
            <Users />
            <span>
              <small>ACOMPAÑAMIENTO</small>
              <b>Tutorías especializadas</b>
            </span>
          </div>
        </div>
      </main>
    </Shell>
  );
}
