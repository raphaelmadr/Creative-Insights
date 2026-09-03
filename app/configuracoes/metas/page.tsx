"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Plus, Trash2, ArrowUp, ArrowDown, ChevronDown, ChevronRight } from "lucide-react";

const formatCurrencyInput = (value: number | string) => {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? Number(value.replace(/\D/g, "")) / 100 : value;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string) => {
  const numericValue = value.replace(/\D/g, "");
  return Number(numericValue) / 100;
};

type PlatformRules = {
  minSpend: number;
  minReturn: number;
  maxCpa: number;
};

type CreativeCategory = {
  id: string;
  name: string;
  emoji: string;
  rules: {
    META: PlatformRules;
    TIKTOK: PlatformRules;
    GOOGLE: PlatformRules;
  };
};

const DEFAULT_CATEGORIES: CreativeCategory[] = [
  {
    id: "cat_super_winners",
    name: "Super Winners",
    emoji: "🏆",
    rules: {
      META: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      TIKTOK: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
      GOOGLE: { minSpend: 1000, minReturn: 5000, maxCpa: 50 },
    }
  },
  {
    id: "cat_winners",
    name: "Winners",
    emoji: "🚀",
    rules: {
      META: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      TIKTOK: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
      GOOGLE: { minSpend: 500, minReturn: 2000, maxCpa: 60 },
    }
  }
];

export default function MetasPage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  
  const [selectedGoalMonth, setSelectedGoalMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedGoalYear, setSelectedGoalYear] = useState(() => new Date().getFullYear());
  const [monthlyGoal, setMonthlyGoal] = useState({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });

  const [categories, setCategories] = useState<CreativeCategory[]>([]);
  const [originalSettings, setOriginalSettings] = useState<any>({});
  
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [activeTabs, setActiveTabs] = useState<Record<string, 'META'|'TIKTOK'|'GOOGLE'>>({});

  useEffect(() => {
    setFetching(true);
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetch(`/api/goals?month=${selectedGoalMonth}&year=${selectedGoalYear}`).then(r => r.json()),
    ]).then(([settingsRes, goalsRes]) => {
      if (settingsRes.success && settingsRes.data) {
        setOriginalSettings(settingsRes.data);
        if (settingsRes.data.creativeCategories) {
          try {
            setCategories(JSON.parse(settingsRes.data.creativeCategories));
          } catch (e) {
            setCategories(DEFAULT_CATEGORIES);
          }
        } else {
          // Fallback to legacy structure if no JSON yet
          const cats = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
          cats[0].rules.META.minSpend = settingsRes.data.superWinnerSpend ?? 1000;
          cats[0].rules.META.minReturn = settingsRes.data.superWinnerReturn ?? 5000;
          cats[0].rules.META.minCpa = settingsRes.data.superWinnerCpa ?? 50;
          cats[1].rules.META.minSpend = settingsRes.data.winnerSpend ?? 500;
          cats[1].rules.META.minReturn = settingsRes.data.winnerReturn ?? 2000;
          cats[1].rules.META.minCpa = settingsRes.data.winnerCpa ?? 60;
          setCategories(cats);
        }
      }
      if (goalsRes.success && goalsRes.data) {
        setMonthlyGoal({
          spendGoal: goalsRes.data.spendGoal ?? 0,
          revenueGoal: goalsRes.data.revenueGoal ?? 0,
          cpaGoal: goalsRes.data.cpaGoal ?? 0,
        });
      } else {
        setMonthlyGoal({ spendGoal: 0, revenueGoal: 0, cpaGoal: 0 });
      }
    }).finally(() => {
      setFetching(false);
    });
  }, [selectedGoalMonth, selectedGoalYear]);

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingSettings(true);
    try {
      const payload = {
        ...originalSettings,
        creativeCategories: JSON.stringify(categories)
      };
      
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert("Critérios de Performance salvos com sucesso!");
      } else {
        alert("Erro ao salvar critérios.");
      }
    } catch (err) {
      alert("Erro ao salvar critérios.");
    }
    setSavingSettings(false);
  };

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
      if (!res.ok) throw new Error();
      alert("Metas mensais salvas!");
    } catch (e) {
      alert("Erro ao salvar metas mensais");
    }
    setSavingGoal(false);
  };

  const addCategory = () => {
    const newId = `cat_${Date.now()}`;
    setCategories([
      ...categories,
      {
        id: newId,
        name: "Nova Categoria",
        emoji: "🎯",
        rules: {
          META: { minSpend: 0, minReturn: 0, maxCpa: 0 },
          TIKTOK: { minSpend: 0, minReturn: 0, maxCpa: 0 },
          GOOGLE: { minSpend: 0, minReturn: 0, maxCpa: 0 },
        }
      }
    ]);
    setExpandedCategory(newId);
    setActiveTabs(prev => ({ ...prev, [newId]: 'META' }));
  };

  const removeCategory = (id: string) => {
    if (confirm("Tem certeza que deseja remover esta categoria?")) {
      setCategories(categories.filter(c => c.id !== id));
    }
  };

  const updateCategoryRule = (catId: string, platform: 'META'|'TIKTOK'|'GOOGLE', field: keyof PlatformRules, value: number) => {
    setCategories(categories.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          rules: {
            ...c.rules,
            [platform]: {
              ...c.rules[platform],
              [field]: value
            }
          }
        };
      }
      return c;
    }));
  };

  const updateCategoryBase = (catId: string, field: 'name' | 'emoji', value: string) => {
    setCategories(categories.map(c => {
      if (c.id === catId) {
        return { ...c, [field]: value };
      }
      return c;
    }));
  };

  const moveCategory = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index > 0) {
      const newCats = [...categories];
      [newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]];
      setCategories(newCats);
    } else if (direction === 'down' && index < categories.length - 1) {
      const newCats = [...categories];
      [newCats[index + 1], newCats[index]] = [newCats[index], newCats[index + 1]];
      setCategories(newCats);
    }
  };

  if (fetching) {
    return (
      <div className="glass-panel" style={{ padding: "4rem", display: "flex", justifyContent: "center", opacity: 0.5 }}>
        <Loader2 className="spin" size={32} color="var(--primary)" />
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{ padding: "2rem", borderRadius: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        
        {/* Metas Mensais */}
        <div style={{ padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Metas de KPIs Mensais</h3>
            <div style={{ display: "flex", gap: "1rem" }}>
              <select value={selectedGoalMonth} onChange={e => setSelectedGoalMonth(Number(e.target.value))} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)", fontWeight: 600 }}>
                <option value={1}>Janeiro</option><option value={2}>Fevereiro</option><option value={3}>Março</option>
                <option value={4}>Abril</option><option value={5}>Maio</option><option value={6}>Junho</option>
                <option value={7}>Julho</option><option value={8}>Agosto</option><option value={9}>Setembro</option>
                <option value={10}>Outubro</option><option value={11}>Novembro</option><option value={12}>Dezembro</option>
              </select>
              <input type="number" value={selectedGoalYear} onChange={e => setSelectedGoalYear(Number(e.target.value))} style={{ padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)", fontWeight: 600, width: "80px" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Investimento (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.spendGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, spendGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>Receita Líquida (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.revenueGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, revenueGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.9rem" }}>
              <span style={{ fontWeight: 600 }}>CPA Máximo (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.cpaGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, cpaGoal: parseCurrencyInput(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--background-main)", color: "var(--foreground)" }} />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button type="button" onClick={handleSaveMonthlyGoal} disabled={savingGoal} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {savingGoal ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Salvar Metas do Mês
            </button>
          </div>
        </div>

        {/* Critérios de IA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>Categorias Dinâmicas</h3>
              <p style={{ fontSize: "0.85rem", opacity: 0.6, margin: "0.25rem 0 0" }}>A ordem define a prioridade da validação (de cima para baixo). O que não bater meta vira "Área de Testes".</p>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button type="button" onClick={addCategory} style={{ background: "transparent", color: "var(--foreground)", border: "1px solid var(--card-border)", padding: "0.6rem 1rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <Plus size={16} /> Adicionar Categoria
              </button>
              <button type="button" onClick={handleSaveSettings} disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.6rem 1.5rem", borderRadius: "6px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                Salvar Critérios
              </button>
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {categories.map((cat, idx) => {
              const isExpanded = expandedCategory === cat.id;
              const activePlatform = activeTabs[cat.id] || 'META';
              
              return (
              <div key={cat.id} style={{ display: "flex", flexDirection: "column", padding: "1.5rem", borderRadius: "12px", border: `1px solid var(--card-border)`, background: `var(--card-bg)`, transition: "all 0.3s ease" }}>
                
                {/* Header da Categoria (Accordion Trigger) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      <button type="button" onClick={() => moveCategory(idx, 'up')} disabled={idx === 0} style={{ padding: "0.1rem", opacity: idx === 0 ? 0.2 : 0.8, cursor: idx === 0 ? "default" : "pointer", background: "var(--card-border)", borderRadius: "4px", border: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }} title="Mover para Cima"><ArrowUp size={14} /></button>
                      <button type="button" onClick={() => moveCategory(idx, 'down')} disabled={idx === categories.length - 1} style={{ padding: "0.1rem", opacity: idx === categories.length - 1 ? 0.2 : 0.8, cursor: idx === categories.length - 1 ? "default" : "pointer", background: "var(--card-border)", borderRadius: "4px", border: "none", color: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }} title="Mover para Baixo"><ArrowDown size={14} /></button>
                    </div>
                    
                    <button type="button" onClick={() => setExpandedCategory(isExpanded ? null : cat.id)} style={{ background: "none", border: "none", color: "var(--foreground)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem" }}>
                      {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </button>

                    <input 
                      type="text" 
                      value={cat.emoji || ""} 
                      onChange={e => updateCategoryBase(cat.id, 'emoji', e.target.value)}
                      style={{ fontSize: "1.2rem", padding: "0.4rem", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--background-main)", width: "45px", textAlign: "center" }}
                      maxLength={2}
                      placeholder="🚀"
                    />
                    <input 
                      type="text" 
                      value={cat.name} 
                      onChange={e => updateCategoryBase(cat.id, 'name', e.target.value)} 
                      style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--foreground)", border: "none", background: "transparent", borderBottom: `1px dashed var(--card-border)`, padding: "0.25rem 0", width: "200px" }}
                    />
                  </div>
                  <button type="button" onClick={() => removeCategory(cat.id)} style={{ color: "var(--danger)", opacity: 0.7, padding: "0.5rem", background: "none", border: "none", cursor: "pointer" }} title="Remover Categoria">
                    <Trash2 size={18} />
                  </button>
                </div>

                {/* Conteúdo Expansível (Tabs) */}
                {isExpanded && (
                  <div style={{ marginTop: "1.5rem", borderTop: "1px solid var(--card-border)", paddingTop: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                    
                    {/* Seletor de Tabs */}
                    <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--card-border)", paddingBottom: "0.5rem" }}>
                      {(['META', 'TIKTOK', 'GOOGLE'] as const).map(platform => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => setActiveTabs(prev => ({ ...prev, [cat.id]: platform }))}
                          style={{
                            padding: "0.5rem 1rem",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            color: activePlatform === platform ? "var(--primary)" : "var(--foreground)",
                            opacity: activePlatform === platform ? 1 : 0.6,
                            borderBottom: activePlatform === platform ? "2px solid var(--primary)" : "2px solid transparent",
                            transition: "all 0.2s"
                          }}
                        >
                          {platform === 'META' && "Meta Ads"}
                          {platform === 'TIKTOK' && "TikTok Ads"}
                          {platform === 'GOOGLE' && "Google Ads"}
                        </button>
                      ))}
                    </div>

                    {/* Inputs da Tab Ativa */}
                    <div style={{ background: "var(--background-main)", padding: "1.5rem", borderRadius: "8px", border: "1px solid var(--card-border)", display: "flex", flexDirection: "column", gap: "1rem" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: 600 }}>Gasto Mínimo (R$)</span>
                          <input type="text" value={formatCurrencyInput(cat.rules[activePlatform].minSpend)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'minSpend', parseCurrencyInput(e.target.value))} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: 600 }}>Retorno Mínimo (R$)</span>
                          <input type="text" value={formatCurrencyInput(cat.rules[activePlatform].minReturn)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'minReturn', parseCurrencyInput(e.target.value))} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "0.85rem" }}>
                          <span style={{ fontWeight: 600 }}>CPA Máximo (R$)</span>
                          <input type="text" value={formatCurrencyInput(cat.rules[activePlatform].maxCpa)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'maxCpa', parseCurrencyInput(e.target.value))} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
                        </label>
                      </div>
                      <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: 0 }}>* Um valor preenchido como "0,00" anulará o critério. A validação exigirá apenas as métricas que tiverem um valor definido.</p>
                    </div>

                  </div>
                )}
              </div>
            )})}
          </div>

        </div>
      </div>
    </div>
  );
}
