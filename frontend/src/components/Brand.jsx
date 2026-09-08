import { Link } from "react-router-dom";

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Ir al inicio">
      <span className="brand-mark">
        <img src="/assets/logo-facultad-ingenieria.png" alt="" />
      </span>
      <span>
        <b>UNDC</b>
        <div className="text-xs font-bold">Facultad de Ingeniería</div>
      </span>
    </Link>
  );
}
