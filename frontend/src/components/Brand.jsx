import { Link } from "react-router-dom";

export default function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Ir al inicio">
      <span className="brand-mark">
        <img src="/assets/logo-facultad-ingenieria.png" alt="" />
      </span>
      <span>
        <b>UNDC</b>
        <small>Facultad de Ingeniería</small>
      </span>
    </Link>
  );
}
