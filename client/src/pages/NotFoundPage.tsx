import { ArrowLeft, Home } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

// Página 404: la dirección no existe dentro de SIRAE.
export function NotFoundPage() {
  const navigate = useNavigate();
  return <section className="not-found" aria-labelledby="not-found-title">
    <img src="/sirae-logo.webp" alt="SIRAE" width={140} height={91} />
    <p className="not-found-code" aria-hidden="true">404</p>
    <h1 id="not-found-title">No encontramos esta página</h1>
    <p>Puede que el enlace esté incompleto o que la página ya no exista. Revisa la dirección o vuelve al inicio.</p>
    <div className="not-found-actions">
      <Link className="button button-primary" to="/"><Home size={18} /> Ir al inicio</Link>
      <button className="button button-secondary" onClick={() => navigate(-1)}><ArrowLeft size={18} /> Volver atrás</button>
    </div>
  </section>;
}
