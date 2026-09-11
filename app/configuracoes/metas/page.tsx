"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import Modal from "@/components/Modal";

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
  
  /* Qual categoria está aberta no diálogo. Era um acordeão na página: a
     configuração de uma categoria empurrava todas as outras para baixo. */
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
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

  /**
   * Resumo dos critérios, para a linha dizer algo sem abrir o diálogo.
   *
   * Zero desliga o critério (é o que a nota do formulário avisa), então só
   * entram no resumo os que realmente filtram alguma coisa.
   */
  const describeRules = (cat: any) => {
    const ativos = (['META', 'TIKTOK', 'GOOGLE'] as const).filter(p => {
      const r = cat.rules?.[p];
      return r && (r.minSpend > 0 || r.minReturn > 0 || r.maxCpa > 0);
    });
    if (ativos.length === 0) return "Sem critério — aceita qualquer anúncio";
    const nomes = { META: "Meta", TIKTOK: "TikTok", GOOGLE: "Google" };
    return `Critérios em ${ativos.map(p => nomes[p]).join(", ")}`;
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
    setEditingCategory(newId);
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
    /*
     * Sem painel externo: os blocos internos já são cartões com borda, e o
     * envoltório criava moldura dentro de moldura. Igual às outras telas de
     * configuração.
     */
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        
        {/* Metas Mensais */}
        <div style={{ padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--card-border)", background: "rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
            <h3 style={{ fontSize: "var(--text-cardtitle)", fontWeight: 600, margin: 0 }}>Metas de KPIs Mensais</h3>
            <div style={{ display: "flex", gap: "1rem" }}>
              <select value={selectedGoalMonth} onChange={e => setSelectedGoalMonth(Number(e.target.value))} className="field-input">
                <option value={1}>Janeiro</option><option value={2}>Fevereiro</option><option value={3}>Março</option>
                <option value={4}>Abril</option><option value={5}>Maio</option><option value={6}>Junho</option>
                <option value={7}>Julho</option><option value={8}>Agosto</option><option value={9}>Setembro</option>
                <option value={10}>Outubro</option><option value={11}>Novembro</option><option value={12}>Dezembro</option>
              </select>
              <input type="number" value={selectedGoalYear} onChange={e => setSelectedGoalYear(Number(e.target.value))} className="field-input" style={{ width: "80px" }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1.5rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-control)" }}>
              <span style={{ fontWeight: 600 }}>Investimento (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.spendGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, spendGoal: parseCurrencyInput(e.target.value)})} className="field-input" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-control)" }}>
              <span style={{ fontWeight: 600 }}>Receita Líquida (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.revenueGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, revenueGoal: parseCurrencyInput(e.target.value)})} className="field-input" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontSize: "var(--text-control)" }}>
              <span style={{ fontWeight: 600 }}>CPA Máximo (R$)</span>
              <input type="text" value={formatCurrencyInput(monthlyGoal.cpaGoal)} onChange={e => setMonthlyGoal({...monthlyGoal, cpaGoal: parseCurrencyInput(e.target.value)})} className="field-input" />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <button type="button" onClick={handleSaveMonthlyGoal} disabled={savingGoal} className="btn btn-primary">
              {savingGoal ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              Salvar Metas do Mês
            </button>
          </div>
        </div>

        {/* Critérios de IA */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h3 style={{ fontSize: "var(--text-cardtitle)", fontWeight: 600, margin: 0 }}>Categorias Dinâmicas</h3>
              <p style={{ fontSize: "var(--text-caption)", opacity: 0.6, margin: "0.25rem 0 0" }}>A ordem define a prioridade da validação (de cima para baixo). O que não bater meta vira "Área de Testes".</p>
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button type="button" onClick={addCategory} className="btn btn-secondary">
                <Plus size={16} /> Adicionar Categoria
              </button>
              <button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="btn btn-primary">
                {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                Salvar Critérios
              </button>
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {categories.map((cat, idx) => (
              /* A linha só apresenta a categoria: emoji, nome, ordem e as
                 ações. Os critérios de entrada vivem no diálogo. */
              <div key={cat.id} className="allu-card" style={{ flexDirection: "row", alignItems: "center", gap: "0.85rem", padding: "0.7rem 0.9rem" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                  <button type="button" onClick={() => moveCategory(idx, 'up')} disabled={idx === 0} className="btn btn-icon" style={{ width: "1.4rem", height: "1.2rem" }} title="Mover para cima">
                    <ArrowUp size={13} />
                  </button>
                  <button type="button" onClick={() => moveCategory(idx, 'down')} disabled={idx === categories.length - 1} className="btn btn-icon" style={{ width: "1.4rem", height: "1.2rem" }} title="Mover para baixo">
                    <ArrowDown size={13} />
                  </button>
                </div>

                <span style={{ fontSize: "var(--text-metric)", width: "34px", height: "34px", borderRadius: "var(--radius-block)", background: "var(--background-main)", border: "1px solid var(--card-border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {cat.emoji || "🎯"}
                </span>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: "var(--text-control)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cat.name}
                  </span>
                  <span className="field-hint">{describeRules(cat)}</span>
                </div>

                <button type="button" onClick={() => { setEditingCategory(cat.id); setActiveTabs(prev => ({ ...prev, [cat.id]: prev[cat.id] || 'META' })); }} className="btn btn-secondary">
                  Configurar
                </button>
                <button type="button" onClick={() => removeCategory(cat.id)} className="btn btn-icon" style={{ color: "var(--danger)" }} title="Remover categoria">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {(() => {
            const cat = categories.find(c => c.id === editingCategory);
            if (!cat) return null;
            const activePlatform = activeTabs[cat.id] || 'META';
            const regra = cat.rules[activePlatform];

            return (
              <Modal
                open
                title="Configurar categoria"
                description="Um anúncio entra na primeira categoria cujos critérios ele cumpre, de cima para baixo."
                onClose={() => setEditingCategory(null)}
                footer={
                  <button type="button" onClick={() => setEditingCategory(null)} className="btn btn-primary">
                    Concluir
                  </button>
                }
              >
                <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-end" }}>
                  <label className="field" style={{ width: "70px" }}>
                    <span className="field-label">Emoji</span>
                    <input
                      type="text"
                      value={cat.emoji || ""}
                      onChange={e => updateCategoryBase(cat.id, 'emoji', e.target.value)}
                      className="field-input"
                      style={{ textAlign: "center" }}
                      maxLength={2}
                      placeholder="🎯"
                    />
                  </label>
                  <label className="field" style={{ flex: 1 }}>
                    <span className="field-label">Nome da categoria</span>
                    <input
                      type="text"
                      value={cat.name}
                      onChange={e => updateCategoryBase(cat.id, 'name', e.target.value)}
                      className="field-input"
                      placeholder="Ex: Super Winners"
                    />
                  </label>
                </div>

                {/* Os critérios são por canal: o mesmo gasto não significa a
                    mesma coisa no Meta e no TikTok. */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {(['META', 'TIKTOK', 'GOOGLE'] as const).map(platform => (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => setActiveTabs(prev => ({ ...prev, [cat.id]: platform }))}
                      aria-pressed={activePlatform === platform}
                      className="btn btn-toggle"
                    >
                      {platform === 'META' && "Meta Ads"}
                      {platform === 'TIKTOK' && "TikTok Ads"}
                      {platform === 'GOOGLE' && "Google Ads"}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                  <label className="field">
                    <span className="field-label">Gasto mínimo (R$)</span>
                    <input type="text" value={formatCurrencyInput(regra.minSpend)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'minSpend', parseCurrencyInput(e.target.value))} className="field-input" />
                  </label>
                  <label className="field">
                    <span className="field-label">Retorno mínimo (R$)</span>
                    <input type="text" value={formatCurrencyInput(regra.minReturn)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'minReturn', parseCurrencyInput(e.target.value))} className="field-input" />
                  </label>
                  <label className="field">
                    <span className="field-label">CPA máximo (R$)</span>
                    <input type="text" value={formatCurrencyInput(regra.maxCpa)} onChange={e => updateCategoryRule(cat.id, activePlatform, 'maxCpa', parseCurrencyInput(e.target.value))} className="field-input" />
                  </label>
                </div>

                <p className="field-hint">
                  Zero anula o critério — a categoria deixa de filtrar por ele. Os valores valem
                  apenas para <strong>{activePlatform === 'META' ? "Meta Ads" : activePlatform === 'TIKTOK' ? "TikTok Ads" : "Google Ads"}</strong>;
                  os outros canais têm os seus.
                </p>
              </Modal>
            );
          })()}

        </div>
    </div>
  );
}
