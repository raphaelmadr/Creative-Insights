const fs = require('fs');
const file = '/Users/raphael/Desktop/Creative Insights/app/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add monthly goal state
content = content.replace(
  `const [metrics, setMetrics] = useState<{ totalSpend: string; totalRiskApprovedValue: string; totalGrossValue: string; avgCtr: string; avgCpa: string }>({ totalSpend: "0.00", totalRiskApprovedValue: "0.00", totalGrossValue: "0.00", avgCtr: "0.00", avgCpa: "0.00" });`,
  `const [metrics, setMetrics] = useState<{ totalSpend: string; totalRiskApprovedValue: string; totalGrossValue: string; avgCtr: string; avgCpa: string }>({ totalSpend: "0.00", totalRiskApprovedValue: "0.00", totalGrossValue: "0.00", avgCtr: "0.00", avgCpa: "0.00" });\n  const [currentGoal, setCurrentGoal] = useState({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });`
);

// Add useEffect to load the goal based on dateTo
const hookCode = `
  useEffect(() => {
    if (!dateTo) return;
    const dateObj = new Date(dateTo);
    const m = dateObj.getUTCMonth() + 1;
    const y = dateObj.getUTCFullYear();
    fetch(\`/api/goals?month=\${m}&year=\${y}\`)
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          setCurrentGoal({
            spendGoal: res.data.spendGoal || 0,
            revenueGoal: res.data.revenueGoal || 0,
            cpaGoal: res.data.cpaGoal || 0
          });
        } else {
          setCurrentGoal({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });
        }
      });
  }, [dateTo]);

  // Pace Calculations
  const spendPace = currentGoal.spendGoal > 0 ? (parseFloat(metrics.totalSpend) / currentGoal.spendGoal) * 100 : 0;
  const revenuePace = currentGoal.revenueGoal > 0 ? (parseFloat(metrics.totalRiskApprovedValue) / currentGoal.revenueGoal) * 100 : 0;
  const cpaPace = currentGoal.cpaGoal > 0 ? (parseFloat(metrics.avgCpa) / currentGoal.cpaGoal) * 100 : 0;

  const renderPace = (pace: number) => {
    if (pace === 0) return null;
    return <span style={{ marginLeft: "6px", color: pace > 100 ? "var(--primary)" : "var(--foreground-muted)", fontWeight: 500 }}>| Pace: {pace.toFixed(1)}%</span>;
  };
`;

content = content.replace(`useEffect(() => {\n    fetch("/api/creators")`, hookCode + `\n  useEffect(() => {\n    fetch("/api/creators")`);

// Update KPI cards
content = content.replace(
  `<div className="allu-card-subtext">gasto nas campanhas</div>`,
  `<div className="allu-card-subtext">Meta: R$ {currentGoal.spendGoal.toLocaleString('pt-BR')} {renderPace(spendPace)}</div>`
);

content = content.replace(
  `<div className="allu-card-subtext">real aprovado</div>`,
  `<div className="allu-card-subtext">Meta: R$ {currentGoal.revenueGoal.toLocaleString('pt-BR')} {renderPace(revenuePace)}</div>`
);

content = content.replace(
  `<div className="allu-card-subtext">custo por aprovado</div>`,
  `<div className="allu-card-subtext">Meta: R$ {currentGoal.cpaGoal.toLocaleString('pt-BR')} {renderPace(cpaPace)}</div>`
);

fs.writeFileSync(file, content);
