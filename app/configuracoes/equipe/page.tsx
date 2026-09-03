"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Trash2, Plus } from "lucide-react";
import { Avatar } from "@/components/Avatar";

const formatCurrencyInput = (value: number | string) => {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? Number(value.replace(/\D/g, "")) / 100 : value;
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string) => {
  const numericValue = value.replace(/\D/g, "");
  return Number(numericValue) / 100;
};

export default function EquipePage() {
  const [fetching, setFetching] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [creators, setCreators] = useState<any[]>([]);
  const [newCreator, setNewCreator] = useState({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
  const [editingCreatorId, setEditingCreatorId] = useState<string | null>(null);
  
  const [settings, setSettings] = useState({
    teamCreativeGoal: 300,
  });

  const fetchCreators = async () => {
    try {
      const res = await fetch("/api/creators").then(r => r.json());
      if (res.data) setCreators(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setFetching(true);
    Promise.all([
      fetch("/api/settings").then(r => r.json()),
      fetchCreators()
    ]).then(([settingsRes]) => {
      if (settingsRes.success && settingsRes.data) {
        setSettings({
          teamCreativeGoal: settingsRes.data.teamCreativeGoal ?? 300,
        });
      }
    }).finally(() => {
      setFetching(false);
    });
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert("Meta global salva com sucesso!");
      } else {
        alert("Erro ao salvar meta global.");
      }
    } catch (err) {
      alert("Erro ao salvar meta global.");
    }
    setSavingSettings(false);
  };

  const handleAddCreator = async () => {
    if (!newCreator.name || !newCreator.acronym) return;
    try {
      const mGoal = Number(newCreator.monthlyGoal) || 50000;
      const mVolGoal = Number(newCreator.monthlyVolumeGoal) || 30;
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newCreator, monthlyGoal: mGoal, monthlyVolumeGoal: mVolGoal })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCreator = async () => {
    if (!editingCreatorId || !newCreator.name || !newCreator.acronym) return;
    try {
      const mGoal = Number(newCreator.monthlyGoal) || 50000;
      const mVolGoal = Number(newCreator.monthlyVolumeGoal) || 30;
      const res = await fetch(`/api/creators`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCreatorId, ...newCreator, monthlyGoal: mGoal, monthlyVolumeGoal: mVolGoal })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        setEditingCreatorId(null);
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCreator = (c: any) => {
    setEditingCreatorId(c.id);
    setNewCreator({
      name: c.name,
      acronym: c.acronym,
      avatarUrl: c.avatarUrl || "",
      monthlyGoal: c.monthlyGoal || 50000,
      monthlyVolumeGoal: c.monthlyVolumeGoal || 30
    });
  };

  const handleCancelEdit = () => {
    setEditingCreatorId(null);
    setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
  };

  const handleDeleteCreator = async (id: string) => {
    if (!confirm("Tem certeza que deseja remover este criador?")) return;
    try {
      const res = await fetch(`/api/creators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchCreators();
      }
    } catch (err) {
      console.error(err);
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
        
        {/* Meta Global do Time */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Meta Global do Time (peças/mês)</span>
            <input type="number" required value={settings.teamCreativeGoal} onChange={e => setSettings({...settings, teamCreativeGoal: Number(e.target.value)})} style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", maxWidth: "200px" }} />
          </label>
          <button type="button" onClick={handleSaveSettings} disabled={savingSettings} style={{ background: "var(--primary)", color: "#fff", border: "none", padding: "0.8rem 1.5rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Meta
          </button>
        </div>

        <div style={{ background: "rgba(0,0,0,0.02)", border: "1px solid var(--card-border)", borderRadius: "12px", padding: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 1rem 0" }}>
            {editingCreatorId ? "Editar Membro da Equipe" : "Adicionar Novo Membro"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Nome do Criador</span>
              <input type="text" value={newCreator.name} onChange={e => setNewCreator({...newCreator, name: e.target.value})} placeholder="Ex: Raphael Madureira" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Siglas (Até 3, separadas por vírgula)</span>
              <input type="text" value={newCreator.acronym} onChange={e => setNewCreator({...newCreator, acronym: e.target.value.toUpperCase()})} placeholder="Ex: RM, RAPHAELMADUREIRA" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)", textTransform: "uppercase" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>URL da Foto (Avatar) - Opcional</span>
              <input type="url" value={newCreator.avatarUrl} onChange={e => setNewCreator({...newCreator, avatarUrl: e.target.value})} placeholder="https://..." style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Mensal (R$)</span>
              <input type="text" value={formatCurrencyInput(newCreator.monthlyGoal)} onChange={e => setNewCreator({...newCreator, monthlyGoal: parseCurrencyInput(e.target.value)})} placeholder="50.000,00" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>Meta Volume (Peças/mês)</span>
              <input type="number" value={newCreator.monthlyVolumeGoal} onChange={e => setNewCreator({...newCreator, monthlyVolumeGoal: Number(e.target.value)})} placeholder="30" style={{ padding: "0.8rem", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--card-bg)", color: "var(--foreground)" }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1.5rem" }}>
            <button type="button" onClick={editingCreatorId ? handleUpdateCreator : handleAddCreator} style={{ flex: 1, background: "var(--foreground)", color: "var(--background-main)", border: "none", padding: "0.8rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              {editingCreatorId ? <Save size={18} /> : <Plus size={18} />}
              {editingCreatorId ? "Salvar Alterações" : "Adicionar Membro"}
            </button>
            {editingCreatorId && (
              <button type="button" onClick={handleCancelEdit} style={{ flex: 1, background: "transparent", border: "1px solid var(--card-border)", color: "var(--foreground)", padding: "0.8rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--foreground)", margin: "0 0 0.5rem 0" }}>Equipe Atual</h3>
          {creators.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem", border: "1px solid var(--card-border)", borderRadius: "8px", background: "var(--card-bg)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <Avatar name={c.name} src={c.avatarUrl} size="md" />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontWeight: 600 }}>{c.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({c.acronym})</span></span>
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Meta: R$ {parseFloat(c.monthlyGoal).toLocaleString('pt-BR')} | {c.monthlyVolumeGoal} peças</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={() => handleEditCreator(c)} style={{ background: "transparent", border: "1px solid var(--card-border)", padding: "0.5rem 1rem", borderRadius: "6px", cursor: "pointer", color: "var(--foreground)", fontWeight: 600 }}>Editar</button>
                <button type="button" onClick={() => handleDeleteCreator(c.id)} style={{ background: "rgba(239, 68, 68, 0.1)", border: "none", padding: "0.5rem", borderRadius: "6px", cursor: "pointer", color: "#ef4444" }} title="Remover"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {creators.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)", border: "1px dashed var(--card-border)", borderRadius: "8px" }}>
              Nenhum criador cadastrado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
