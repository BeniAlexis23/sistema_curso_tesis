import { Banknote, Landmark, ShieldCheck } from "lucide-react";

export default function PaymentCard({ course }) {
  const [nationalBank, interbank] = course.banks;
  return (
    <div className="payment-card">
      <div className="flex items-center justify-between bg-undc-navy px-5 py-5 text-white sm:px-6">
        <span className="text-[11px] font-bold tracking-[0.16em] text-slate-300">INVERSIÓN TOTAL</span>
        <strong className="font-display text-2xl font-extrabold sm:text-3xl"><small className="mr-1 text-xs font-bold text-undc-cyan">S/</small>4,000.00</strong>
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
