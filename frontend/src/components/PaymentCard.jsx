import { Banknote, Landmark, ShieldCheck } from "lucide-react";

export default function PaymentCard({ course }) {
  const [nationalBank, interbank] = course.banks;
  return (
    <div className="payment-card">
      <div className="prices">
        <div>
          <small>INSCRIPCIÓN</small>
          <strong>
            <sup>S/</sup> {course.registration_fee}
          </strong>
        </div>
        <div>
          <small>I MÓDULO</small>
          <strong>
            <sup>S/</sup> {course.first_module_fee}
          </strong>
        </div>
      </div>
      <div className="banks">
        <div>
          <span className="bank-icon">
            <Landmark size={19} />
          </span>
          <p>
            <b>{nationalBank?.name}</b>
            <small>Cuenta corriente</small>
            <code>{nationalBank?.account_number}</code>
            <small>CCI</small>
            <code>{nationalBank?.cci}</code>
          </p>
        </div>
        <div>
          <span className="bank-icon">
            <Banknote size={19} />
          </span>
          <p>
            <b>{interbank?.name}</b>
            <small>Cuenta corriente</small>
            <code>{interbank?.account_number}</code>
          </p>
        </div>
      </div>
      <p className="bank-note">
        <ShieldCheck size={17} /> Indica el número de DNI del estudiante al
        realizar el depósito. Ambas cuentas están a nombre de la Universidad
        Nacional de Cañete.
      </p>
    </div>
  );
}
