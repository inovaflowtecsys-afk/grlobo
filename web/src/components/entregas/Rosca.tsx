type Props = { valor: number | null; rotulo: string; cor: string; className?: string };

/** Rosca com o percentual inteiro no centro (texto no SVG, escala junto com o tamanho). `valor` null mostra "—". */
export function Rosca({ valor, rotulo, cor, className }: Props) {
  const raio = 41;
  const circunferencia = 2 * Math.PI * raio;
  const pct = valor == null ? 0 : Math.min(100, Math.max(0, valor));

  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`${rotulo}: ${valor == null ? "sem dados" : `${valor}%`}`} className={className}>
      <g transform="rotate(-90 50 50)">
        <circle cx="50" cy="50" r={raio} fill="none" stroke="#e6ebf2" strokeWidth="9" />
        {pct > 0 ? <circle
          cx="50"
          cy="50"
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(circunferencia * pct) / 100} ${circunferencia}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.22, 1, 0.36, 1), stroke 0.4s" }}
        /> : null}
      </g>
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="fill-brand-dark font-bold" style={{ fontSize: valor == null ? 28 : valor >= 100 ? 24 : 28 }}>
        {valor == null ? "—" : `${valor}%`}
      </text>
    </svg>
  );
}
