import Brand from "./Brand";

export default function Shell({ children, step = 1 }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <div className="step">
          <span>PASO {step} DE 3</span>
          <i>
            <b style={{ width: `${step * 33.333}%` }} />
          </i>
        </div>
      </header>
      {children}
      <footer>
        <span>Universidad Nacional de Cañete</span>
        <span>© 2026 Facultad de Ingeniería</span>
      </footer>
    </div>
  );
}
