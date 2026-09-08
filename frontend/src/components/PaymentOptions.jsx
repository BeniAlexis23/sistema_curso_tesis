import { CalendarClock, CircleDollarSign } from 'lucide-react'

const options = [
  {
    name: 'Opción 1',
    description: 'Al inscribirte debes presentar en un solo PDF los comprobantes de inscripción y primer módulo.',
    highlight: 'Pago inicial: S/ 1,550.00',
    deadline: 'Adjuntar hasta el 19/09/2026',
    installments: [
      ['Tutoría especializada', 'S/ 750.00', '18/10/2026'],
      ['II módulo', 'S/ 850.00', '18/10/2026'],
      ['III módulo', 'S/ 850.00', '15/11/2026'],
    ],
  },
  {
    name: 'Opción 2',
    description: 'Distribuye la inversión en cuatro pagos según el cronograma indicado.',
    installments: [
      ['Inscripción', 'S/ 700.00', '19/09/2026'],
      ['I módulo', 'S/ 1,100.00', '11/10/2026'],
      ['II módulo', 'S/ 1,100.00', '08/11/2026'],
      ['III módulo', 'S/ 1,100.00', '04/12/2026'],
    ],
  },
]

export default function PaymentOptions() {
  return (
    <section className="mt-10 border-t border-slate-200 pt-8" aria-labelledby="payment-options-title">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cyan-50 text-undc-cyan">
          <CircleDollarSign size={17} />
        </span>
        <div>
          <h3 id="payment-options-title" className="font-display text-lg font-extrabold text-undc-navy">Modalidades de pago</h3>
          <p className="mt-1 text-sm leading-5 text-slate-500">Selecciona una alternativa al completar tu inscripción.</p>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {options.map((option, index) => (
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" key={option.name}>
            <header className="flex items-center justify-between bg-undc-navy px-4 py-3 text-white">
              <strong className="font-display text-base">{option.name}</strong>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold tracking-widest">PLAN {index + 1}</span>
            </header>
            <div className="p-4">
              <p className="m-0 text-sm leading-6 text-slate-600">{option.description}</p>
              {option.highlight && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-extrabold text-amber-900">Inscripción S/ 700 + I módulo S/ 850 = {option.highlight.replace('Pago inicial: ', '')}</p>}
              {option.deadline && <p className="mt-2 flex items-start gap-2 text-xs font-bold leading-5 text-red-700"><CalendarClock className="mt-0.5 shrink-0" size={15} /> {option.deadline}. Adjunta ambos comprobantes en un solo PDF.</p>}
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[350px] border-collapse text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Monto</th><th className="px-3 py-2">Hasta el</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {option.installments.map(([concept, amount, date]) => (
                      <tr key={concept}><td className="px-3 py-2.5 font-bold text-slate-700">{concept}</td><td className="whitespace-nowrap px-3 py-2.5 font-extrabold text-undc-blue">{amount}</td><td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{date}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
