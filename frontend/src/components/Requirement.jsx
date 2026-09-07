import { Check } from "lucide-react";

export default function Requirement({ number, title, children }) {
  return (
    <article className="requirement">
      <span className="number">{number}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
      <Check className="check" size={18} />
    </article>
  );
}
