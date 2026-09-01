const fs = require('fs');
const file = '/Users/raphael/Desktop/Creative Insights/components/SettingsModal.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add "metas_mensais" to activeTab state
content = content.replace(
  `const [activeTab, setActiveTab] = useState<"sistema" | "metas" | "ia" | "api" | "equipe" | "logs">("sistema");`,
  `const [activeTab, setActiveTab] = useState<"sistema" | "metas" | "metas_mensais" | "ia" | "api" | "equipe" | "logs">("sistema");\n  const [selectedGoalMonth, setSelectedGoalMonth] = useState(() => new Date().getMonth() + 1);\n  const [selectedGoalYear, setSelectedGoalYear] = useState(() => new Date().getFullYear());\n  const [monthlyGoal, setMonthlyGoal] = useState({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });\n  const [savingGoal, setSavingGoal] = useState(false);`
);

// Add useEffect to load monthly goal
const hookCode = `
  useEffect(() => {
    if (activeTab === "metas_mensais") {
      setFetching(true);
      fetch(\`/api/goals?month=\${selectedGoalMonth}&year=\${selectedGoalYear}\`)
        .then(res => res.json())
        .then(res => {
          if (res.success && res.data) {
            setMonthlyGoal({
              spendGoal: res.data.spendGoal || 0,
              revenueGoal: res.data.revenueGoal || 0,
              cpaGoal: res.data.cpaGoal || 0
            });
          } else {
            setMonthlyGoal({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });
          }
          setFetching(false);
        })
        .catch(() => {
          setFetching(false);
        });
    }
  }, [activeTab, selectedGoalMonth, selectedGoalYear]);

  const handleSaveMonthlyGoal = async () => {
    setSavingGoal(true);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedGoalMonth,
          year: selectedGoalYear,
          ...monthlyGoal
        })
      });
      if (!res.ok) alert("Erro ao salvar metas mensais");
    } catch (e) {
      alert("Erro ao salvar metas mensais");
    }
    setSavingGoal(false);
  };
`;

content = content.replace(`useEffect(() => {\n    if (isOpen) {`, hookCode + `\n  useEffect(() => {\n    if (isOpen) {`);

// Add tab button
const tabButtonCode = `
              <button 
                type="button" 
                onClick={() => setActiveTab("metas")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "metas" ? 600 : 400,
                  color: activeTab === "metas" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "metas" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                IA Categorias
              </button>
              <button 
                type="button" 
                onClick={() => setActiveTab("metas_mensais")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "metas_mensais" ? 600 : 400,
                  color: activeTab === "metas_mensais" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "metas_mensais" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Metas KPIs
              </button>
`;

content = content.replace(/<button[^>]*>\s*onClick=\{\(\) => setActiveTab\("metas"\)\}[\s\S]*?Metas & Perf[\s\S]*?<\/button>/, tabButtonCode);
content = content.replace(`onClick={() => setActiveTab("metas")}`, `onClick={() => setActiveTab("metas")}`); // cleanup if needed
// Actually let's use a simpler replace for the tab button:
content = content.replace(
  `<button 
                type="button" 
                onClick={() => setActiveTab("metas")}`,
  tabButtonCode + `<button type="button" onClick={() => setActiveTab("metas")} style={{ display: 'none' }}`
);

// Add the metas_mensais tab content
const metasMensaisContent = `
            {activeTab === "metas_mensais" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Mês</span>
                    <select value={selectedGoalMonth} onChange={e => setSelectedGoalMonth(Number(e.target.value))} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }}>
                      <option value={1}>Janeiro</option><option value={2}>Fevereiro</option><option value={3}>Março</option>
                      <option value={4}>Abril</option><option value={5}>Maio</option><option value={6}>Junho</option>
                      <option value={7}>Julho</option><option value={8}>Agosto</option><option value={9}>Setembro</option>
                      <option value={10}>Outubro</option><option value={11}>Novembro</option><option value={12}>Dezembro</option>
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Ano</span>
                    <input type="number" value={selectedGoalYear} onChange={e => setSelectedGoalYear(Number(e.target.value))} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                  </label>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem", padding: "1rem", background: "rgba(59, 130, 246, 0.05)", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#3b82f6" }}>Metas do Mês (KPIs)</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.9 }}>
                      Meta de Investimento (R$)
                      <input type="number" value={monthlyGoal.spendGoal} onChange={e => setMonthlyGoal({...monthlyGoal, spendGoal: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.9 }}>
                      Meta de Receita Líquida / Valor Aprovado (R$)
                      <input type="number" value={monthlyGoal.revenueGoal} onChange={e => setMonthlyGoal({...monthlyGoal, revenueGoal: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem", opacity: 0.9 }}>
                      Meta de CPA (R$)
                      <input type="number" value={monthlyGoal.cpaGoal} onChange={e => setMonthlyGoal({...monthlyGoal, cpaGoal: Number(e.target.value)})} style={{ padding: "0.6rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
                    </label>
                  </div>
                  
                  <button type="button" onClick={handleSaveMonthlyGoal} disabled={savingGoal} style={{ alignSelf: "flex-end", marginTop: "1rem", background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {savingGoal ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                    Salvar Metas Mensais
                  </button>
                </div>
              </div>
            )}
`;

content = content.replace(`{activeTab === "metas" && (`, metasMensaisContent + `\n            {activeTab === "metas" && (`);

fs.writeFileSync(file, content);
