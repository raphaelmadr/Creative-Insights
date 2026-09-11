"use client";

import React, { useState, useEffect } from "react";
import { Save, Loader2, Trash2, Plus } from "lucide-react";
import { splitAcronyms } from "@/lib/acronyms";
import Modal from "@/components/Modal";
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
  /* O formulário mora num diálogo: quem abre a tela quer ver a equipe, não um
     cadastro em branco ocupando meia página. */
  const [formOpen, setFormOpen] = useState(false);

  /*
   * Dois caminhos para entrar na equipe.
   *
   * Quem loga com a conta da empresa já está no sistema com nome e foto: pedir
   * que alguém redigite isso, e cole uma URL de avatar à mão, é trabalho que o
   * login já fez. Então o cadastro corporativo só pergunta o que o Google não
   * sabe — a sigla que aparece no nome do anúncio e as metas.
   *
   * O caminho manual continua existindo para quem não tem conta: parcerias,
   * influenciadores, embaixadores e criadores que já saíram.
   */
  const [accounts, setAccounts] = useState<{ email: string; name: string | null; image: string | null; linkedTo: string | null }[]>([]);
  const [entryMode, setEntryMode] = useState<"corporativo" | "externo">("corporativo");
  const [selectedAccount, setSelectedAccount] = useState("");
  
  const [settings, setSettings] = useState({
    teamCreativeGoal: 300,
  });

  const fetchCreators = async () => {
    try {
      const res = await fetch("/api/creators").then(r => r.json());
      if (res.data) setCreators(res.data);
      if (res.accounts) setAccounts(res.accounts);
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

/** Resume as metas de um membro, omitindo as que estão zeradas. */
function describeGoals(monthlyGoal: unknown, volumeGoal: unknown): string {
  const receita = Number(monthlyGoal) || 0;
  const pecas = Number(volumeGoal) || 0;
  const partes: string[] = [];
  if (receita > 0) partes.push(`R$ ${receita.toLocaleString("pt-BR")}`);
  if (pecas > 0) partes.push(`${pecas} peças`);
  return partes.length ? `Meta: ${partes.join(" | ")}` : "Sem meta definida";
}

/**
 * Lê uma meta do formulário preservando o zero.
 *
 * Era `Number(valor) || padrão`, e `0 || 50000` é 50000 — digitar zero não
 * salvava zero, salvava a meta padrão, sem aviso nenhum. Zero é uma resposta
 * legítima ("esta pessoa não tem meta"), e é o que faz a barra sumir do card.
 * Só campo vazio, texto inválido ou negativo voltam ao padrão.
 */
function parseGoal(value: unknown, fallback: number): number {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

  const handleAddCreator = async () => {
    const corporativo = entryMode === "corporativo";
    // No corporativo o nome vem do Google: o que falta preencher é a conta.
    if (corporativo ? !selectedAccount : !newCreator.name) return;
    if (!newCreator.acronym) return;

    try {
      const mGoal = parseGoal(newCreator.monthlyGoal, 50000);
      const mVolGoal = parseGoal(newCreator.monthlyVolumeGoal, 30);
      const res = await fetch("/api/creators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newCreator,
          monthlyGoal: mGoal,
          monthlyVolumeGoal: mVolGoal,
          userEmail: corporativo ? selectedAccount : null,
        })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        setSelectedAccount("");
        fetchCreators();
        setFormOpen(false);
      } else {
        const erro = await res.json().catch(() => ({}));
        alert(erro.error || "Não foi possível adicionar o membro.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateCreator = async () => {
    if (!editingCreatorId || !newCreator.name || !newCreator.acronym) return;
    try {
      const mGoal = parseGoal(newCreator.monthlyGoal, 50000);
      const mVolGoal = parseGoal(newCreator.monthlyVolumeGoal, 30);
      const res = await fetch(`/api/creators`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingCreatorId,
          ...newCreator,
          monthlyGoal: mGoal,
          monthlyVolumeGoal: mVolGoal,
          // "" desfaz o vínculo e devolve o cadastro ao modo manual.
          userEmail: selectedAccount || null,
        })
      });
      if (res.ok) {
        setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 });
        setEditingCreatorId(null);
        fetchCreators();
        setFormOpen(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCreator = (c: any) => {
    setFormOpen(true);
    setEditingCreatorId(c.id);
    setSelectedAccount(c.userEmail || "");
    setNewCreator({
      name: c.name,
      acronym: c.acronym,
      avatarUrl: c.avatarUrl || "",
      // `??`, não `||`: uma meta zerada tem de reaparecer como zero na edição.
      monthlyGoal: c.monthlyGoal ?? 50000,
      monthlyVolumeGoal: c.monthlyVolumeGoal ?? 30
    });
  };

  const handleCancelEdit = () => {
    setFormOpen(false);
    setEditingCreatorId(null);
    setSelectedAccount("");
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
    /* Mesma razão da tela de Metas: os blocos internos já são cartões. */
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        
        {/* Meta Global do Time */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <span className="field-label">Meta Global do Time (peças/mês)</span>
            <input type="number" required value={settings.teamCreativeGoal} onChange={e => setSettings({...settings, teamCreativeGoal: Number(e.target.value)})} className="field-input" style={{ maxWidth: "200px" }} />
          </label>
          <button type="button" onClick={handleSaveSettings} disabled={savingSettings} className="btn btn-primary">
            {savingSettings ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
            Salvar Meta
          </button>
        </div>

        {/* A ação que abre o cadastro. Sem ela, o formulário ficava aberto na
            página inteira mesmo para quem só queria conferir a lista. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <h3 style={{ fontSize: "var(--text-cardtitle)", fontWeight: 700, margin: 0 }}>Equipe atual</h3>
          <button
            type="button"
            onClick={() => { setEditingCreatorId(null); setSelectedAccount(""); setNewCreator({ name: "", acronym: "", avatarUrl: "", monthlyGoal: 50000, monthlyVolumeGoal: 30 }); setFormOpen(true); }}
            className="btn btn-primary"
          >
            <Plus size={16} />
            Adicionar membro
          </button>
        </div>

        <Modal
          open={formOpen}
          title={editingCreatorId ? "Editar membro da equipe" : "Adicionar novo membro"}
          description={editingCreatorId ? "As siglas ligam os criativos a esta pessoa — mudá-las reatribui o histórico na próxima sincronização." : "Vincule uma conta Google da Allugator ou cadastre um parceiro à mão."}
          onClose={handleCancelEdit}
          footer={
            <>
              <button type="button" onClick={handleCancelEdit} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="button" onClick={editingCreatorId ? handleUpdateCreator : handleAddCreator} className="btn btn-primary">
                {editingCreatorId ? <Save size={16} /> : <Plus size={16} />}
                {editingCreatorId ? "Salvar alterações" : "Adicionar membro"}
              </button>
            </>
          }
        >
          {/* A escolha do caminho só aparece no cadastro: editar não troca a
              origem de um membro que já existe. */}
          {!editingCreatorId && (
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
              {([
                { key: "corporativo", label: "Conta corporativa", hint: `${accounts.filter(a => !a.linkedTo).length} de ${accounts.length} disponíveis` },
                { key: "externo", label: "Externo", hint: "parceria, influenciador, embaixador" },
              ] as const).map(op => {
                const ativo = entryMode === op.key;
                return (
                  <button key={op.key} type="button" onClick={() => setEntryMode(op.key)} aria-pressed={ativo} className="btn btn-toggle" style={{ flex: "1 1 220px", textAlign: "left", flexDirection: "column", alignItems: "flex-start" }} >
                    <span style={{ display: "block", fontWeight: 700, fontSize: "var(--text-control)", color: ativo ? "var(--primary)" : "var(--foreground)" }}>
                      {op.label}
                    </span>
                    <span style={{ display: "block", fontSize: "var(--text-caption)", color: "var(--muted)", marginTop: "0.15rem" }}>
                      {op.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {editingCreatorId && (
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                <span className="field-label">Conta corporativa vinculada</span>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  className="field-input"
                >
                  <option value="">Sem conta — cadastro manual</option>
                  {accounts
                    .filter(a => !a.linkedTo || a.email === selectedAccount)
                    .map(a => (
                      <option key={a.email} value={a.email}>{a.name || a.email} — {a.email}</option>
                    ))}
                </select>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.5 }}>
                  Para quem entrou na equipe antes de ter conta e depois fez o primeiro login: vincular
                  faz o nome e a foto passarem a vir do Google, sem recadastrar.
                </span>
              </label>
            )}

            {!editingCreatorId && entryMode === "corporativo" ? (
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                <span className="field-label">Conta corporativa</span>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  className="field-input"
                >
                  <option value="">Selecione quem entra na equipe...</option>
                  {/* As já vinculadas continuam na lista, desabilitadas: some-las
                      fazia a lista parecer incompleta. */}
                  {accounts.map(a => (
                    <option key={a.email} value={a.email} disabled={!!a.linkedTo}>
                      {a.name || a.email} — {a.email}
                      {a.linkedTo ? `  (já é ${a.linkedTo.split(",")[0].trim()})` : ""}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: "var(--text-caption)", color: "var(--muted)", lineHeight: 1.5 }}>
                  {(() => {
                    const livres = accounts.filter(a => !a.linkedTo).length;
                    const membros = accounts.length - livres;
                    if (accounts.length === 0) {
                      return "Nenhuma conta corporativa no sistema ainda. A conta só passa a existir depois que a pessoa faz login com o Google pela primeira vez.";
                    }
                    return `${accounts.length} contas corporativas no sistema: ${membros} já ${membros === 1 ? "é membro" : "são membros"} e ${livres} ${livres === 1 ? "está disponível" : "estão disponíveis"}. O nome e a foto vêm do Google — só a sigla e as metas precisam ser definidas. Quem nunca fez login não aparece aqui.`;
                  })()}
                </span>
              </label>
            ) : (
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                <span className="field-label">Nome do Criador</span>
                <input type="text" value={newCreator.name} onChange={e => setNewCreator({...newCreator, name: e.target.value})} placeholder="Ex: Duda Lêda (influenciadora)" className="field-input" />
              </label>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
              <span className="field-label">Siglas (Até 3, separadas por vírgula)</span>
              <input type="text" value={newCreator.acronym} onChange={e => setNewCreator({...newCreator, acronym: e.target.value.toUpperCase()})} placeholder="Ex: RM, RAPHAELMADUREIRA" className="field-input" style={{ textTransform: "uppercase" }} />
            </label>
            {(editingCreatorId || entryMode === "externo") && (
              <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem", gridColumn: "span 2" }}>
                <span className="field-label">URL da Foto (Avatar) - Opcional</span>
                <input type="url" value={newCreator.avatarUrl} onChange={e => setNewCreator({...newCreator, avatarUrl: e.target.value})} placeholder="https://..." className="field-input" />
              </label>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span className="field-label">Meta Mensal (R$)</span>
              <input type="text" value={formatCurrencyInput(newCreator.monthlyGoal)} onChange={e => setNewCreator({...newCreator, monthlyGoal: parseCurrencyInput(e.target.value)})} placeholder="50.000,00" className="field-input" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span className="field-label">Meta Volume (Peças/mês)</span>
              <input type="number" value={newCreator.monthlyVolumeGoal} onChange={e => setNewCreator({...newCreator, monthlyVolumeGoal: Number(e.target.value)})} placeholder="30" className="field-input" />
            </label>
          </div>
        </Modal>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {creators.map(c => (
            <div key={c.id} className="allu-card" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: "0.85rem 1rem", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", minWidth: 0 }}>
                <Avatar name={c.name} src={c.avatarUrl} size="md" />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", fontSize: "var(--text-control)", fontWeight: 600 }}>
                    {c.name}
                    {/* Cada sigla vira um selo: é por elas que o criativo é
                        ligado à pessoa, então precisam se ler uma a uma, e não
                        num texto corrido entre parênteses. */}
                    {splitAcronyms(c.acronym).map((sigla: string) => (
                      <span key={sigla} className="acronym-chip">{sigla}</span>
                    ))}
                    {c.userEmail && <span className="acronym-chip" title={c.userEmail}>conta Google</span>}
                  </span>
                  {/* Meta zerada é "sem meta": some da linha em vez de exibir "R$ 0". */}
                  <span className="field-hint">{describeGoals(c.monthlyGoal, c.monthlyVolumeGoal)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button type="button" onClick={() => handleEditCreator(c)} className="btn btn-secondary">Editar</button>
                <button type="button" onClick={() => handleDeleteCreator(c.id)} className="btn btn-icon" style={{ color: "var(--danger)" }} title="Remover"><Trash2 size={18} /></button>
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
  );
}
