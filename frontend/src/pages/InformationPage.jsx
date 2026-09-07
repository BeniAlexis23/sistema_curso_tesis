import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import CourseSummary from "../components/CourseSummary";
import PaymentCard from "../components/PaymentCard";
import Requirement from "../components/Requirement";
import Shell from "../components/Shell";
import { useCourse } from "../hooks/useCourse";

export default function InformationPage() {
  const navigate = useNavigate();
  const course = useCourse();

  return (
    <Shell step={2}>
      <main className="info-page">
        <button className="back" onClick={() => navigate("/")}>
          <ArrowLeft size={17} /> Volver
        </button>
        <header className="info-heading">
          <div>
            <span className="section-kicker">ANTES DE CONTINUAR</span>
            <h1>Información del curso</h1>
            <p>
              Revisa las fechas, requisitos y datos de pago antes de completar
              tu inscripción.
            </p>
          </div>
          <div className="edition">
            <small>EDICIÓN</small>
            <strong>2026</strong>
          </div>
        </header>
        <CourseSummary course={course} />
        <section className="content-grid">
          <div>
            <div className="section-title">
              <span>01</span>
              <div>
                <h2>Requisitos</h2>
                <p>Documentos necesarios para formalizar tu inscripción.</p>
              </div>
            </div>
            <div className="requirements">
              <Requirement number="01" title="Grado académico y ficha de registro SUNEDU en PDF">
                Diploma de bachiller en Ingeniería de Sistemas de la UNDC.
              </Requirement>
              <Requirement number="02" title="Ficha de inscripción">
                Se genera automáticamente luego de completar el formulario.
              </Requirement>
              <Requirement number="03" title="Solicitud FUT">
                Solicita la inscripción al curso, dirigida al coordinador
                general Dr. Carlos Almidón Ortiz, decano de la Facultad de
                Ingeniería.{' '}
                <a
                  className="requirement-inline-link"
                  href="https://docs.google.com/document/d/18hhQPyvgJ1AHnSefBcj1k5vzQeyJPYgc/edit?usp=sharing&ouid=115790155390797479010&rtpof=true&sd=true"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir formato FUT <ExternalLink size={14} />
                </a>
              </Requirement>
            </div>
            <a
              href="https://drive.google.com/file/d/1nlAR243yz2eZzki8puQx2Sj5QtmHNLtw/view?usp=sharing"
              target="_blank"
              rel="noopener noreferrer"
              className="document-link"
            >
              <FileText size={21} />
              <span>
                <b>Cronograma y semanas de clase</b>
                <small>Documento informativo · Abrir en nueva pestaña</small>
              </span>
              <ExternalLink size={17} />
            </a>
          </div>
          <aside>
            <div className="section-title">
              <span>02</span>
              <div>
                <h2>Inversión - s/4000.00</h2>
                <p>Pagos a nombre de la Universidad Nacional de Cañete.</p>
              </div>
            </div>
            <PaymentCard course={course} />
          </aside>
        </section>
        <div className="continue-bar">
          <div>
            <ShieldCheck size={21} />
            <span>
              <b>¿Todo listo?</b>
              <small>En el siguiente paso completarás tus datos.</small>
            </span>
          </div>
          <button onClick={() => navigate("/formulario")}>
            Siguiente <ArrowRight size={18} />
          </button>
        </div>
      </main>
    </Shell>
  );
}
