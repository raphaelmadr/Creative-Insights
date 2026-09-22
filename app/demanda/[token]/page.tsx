"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, LinkIcon } from "lucide-react";
import FieldInput, { type FieldDefinition } from "@/components/creator/FieldInput";
import DatePicker from "@/components/DatePicker";
import {
  ALLOWED_EMAIL_DOMAIN,
  CORPORATE_EMAIL_ERROR,
  isCorporateEmail,
} from "@/lib/corporate-email";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  camposVisiveis,
  limparRespostasOcultas,
  type FormBuiltinKey,
  type Priority,
} from "@/lib/kanban";

/**
 * O formulário de demanda para quem não tem conta.
 *
 * Fora do `(app)` e fora da sessão: quem chega aqui tem o link e mais nada. Por
 * isso a tela não traz cabeçalho, menu nem qualquer caminho para dentro do
 * sistema — ela é uma folha de papel, e a única coisa que faz é entregar a
 * demanda.
 *
 * Folha de papel, e não uma pilha de campos encostada na margem: é a única
 * tela que gente de fora vê, e era a que menos parecia com o resto do sistema.
 * A moldura veio do login — marca no topo, conteúdo em um cartão centrado —
 * porque as duas telas fazem o mesmo trabalho: receber quem chegou de fora e
 * pedir que preencha algo. O desenho mora em `.demanda-*`, no `globals.css`.
 *
 * As perguntas vêm do servidor e são desenhadas pelo MESMO `FieldInput` do
 * formulário interno. Uma segunda cópia do formulário aqui envelheceria: quem
 * acrescentasse um campo no quadro o veria aparecer lá dentro e não aqui, e o
 * defeito só apareceria quando alguém de fora reclamasse.
 *
 * As perguntas de FÁBRICA seguem a mesma regra desde que passaram a ser
 * configuráveis. Antes elas simplesmente não existiam aqui: esta tela sabia
 * desenhar só os campos do quadro, e quem chegava pelo link não tinha onde
 * dizer para quando precisava. A saída foi criar uma pergunta de data à mão —
 * que passou a conviver com o prazo de fábrica do formulário de dentro, duas
 * datas para a mesma demanda. Com as duas portas lendo a mesma configuração,
 * não há mais motivo para a cópia.
 */

interface BoardPublico {
  name: string;
  description: string | null;
  /** As perguntas de fábrica que este quadro faz. Ver `parseFormBuiltins`. */
  builtins: FormBuiltinKey[];
  fields: FieldDefinition[];
}

/** A marca, nas duas versões — a troca é de CSS. Ver `.logo-light`/`.logo-dark`. */
function Marca() {
  const alt = "allu.mkt creative insights";
  const medida: React.CSSProperties = { height: "34px", width: "auto" };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt={alt} className="logo-light" style={medida} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-dark.png" alt={alt} className="logo-dark" style={medida} />
    </>
  );
}

export default function DemandaPublica() {
  const { token } = useParams<{ token: string }>();

  const [board, setBoard] = useState<BoardPublico | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroDeLink, setErroDeLink] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [titulo, setTitulo] = useState("");
  const [briefing, setBriefing] = useState("");
  const [prioridade, setPrioridade] = useState<Priority>("MEDIA");
  const [prazo, setPrazo] = useState("");
  const [link, setLink] = useState("");
  const [valores, setValores] = useState<Record<string, unknown>>({});

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/public/demanda/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (!vivo) return;
        if (json.success) setBoard(json.board);
        else setErroDeLink(json.error || "Link inválido.");
      })
      .catch(() => vivo && setErroDeLink("Não foi possível carregar o formulário."))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [token]);

  /*
   * O e-mail é conferido enquanto se digita, mas só depois do "@".
   *
   * Reclamar do domínio na primeira letra é acusar de erro quem ainda está
   * escrevendo — a mensagem aparece quando já dá para saber que está errado.
   */
  const emailInvalido = email.includes("@") && !isCorporateEmail(email);

  /** Se este quadro faz esta pergunta de fábrica. */
  const pergunta = (key: FormBuiltinKey) => !!board?.builtins.includes(key);

  const faltando = useMemo(() => {
    if (!board) return true;
    if (!isCorporateEmail(email) || !titulo.trim()) return true;
    /* Só o que está NA TELA é cobrado: um condicional escondido não foi
       perguntado, e cobrá-lo deixaria o botão desabilitado apontando para um
       campo que não existe ali. Mesma régua de `validateValues`. */
    return camposVisiveis(board.fields, valores).some((f) => {
      if (!f.required) return false;
      /*
       * O deslizante não tem estado vazio: ele já nasce desenhado no mínimo, e
       * quem quer justamente esse valor não tem o que arrastar. Contá-lo como
       * "não respondido" deixava o botão de enviar desabilitado diante de um
       * formulário inteiro preenchido, sem dizer qual campo faltava — o mesmo
       * defeito que o servidor tinha. Ver `validateValues`.
       */
      if (f.type === "RANGE") return false;
      const v = valores[f.key];
      return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
    });
  }, [board, email, titulo, valores]);

  const enviar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/public/demanda/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /*
         * Só o que foi perguntado sobe — o mesmo critério do formulário de
         * dentro. Mandar o estado inicial de uma pergunta desligada gravaria
         * uma resposta que ninguém deu.
         */
        body: JSON.stringify({
          requesterEmail: email,
          requesterName: nome,
          title: titulo,
          ...(pergunta("description") ? { description: briefing } : {}),
          ...(pergunta("priority") ? { priority: prioridade } : {}),
          ...(pergunta("dueDate") && prazo ? { dueDate: prazo } : {}),
          ...(pergunta("linkUrl") && link.trim() ? { linkUrl: link.trim() } : {}),
          values: valores,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Não foi possível enviar.");
      setPronto(json.code ? `MKT-${json.code}` : "");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  /** O obrigatório, sempre do mesmo jeito. */
  const obrigatorio = (
    <span style={{ color: "var(--danger)", marginLeft: "0.25rem" }} aria-hidden="true">
      *
    </span>
  );

  if (carregando) {
    return (
      <main className="demanda-page" style={{ alignItems: "center" }}>
        <Loader2 className="spin" size={28} color="var(--primary)" />
      </main>
    );
  }

  if (erroDeLink || !board) {
    return (
      <main className="demanda-page">
        <div className="demanda-sheet">
          <header className="demanda-header">
            <Marca />
          </header>
          <div className="demanda-card" style={{ alignItems: "center", textAlign: "center", gap: "0.5rem" }}>
            <LinkIcon size={26} color="var(--muted)" />
            <h1 className="demanda-titulo">Link indisponível</h1>
            <p className="field-hint">{erroDeLink}</p>
          </div>
        </div>
      </main>
    );
  }

  if (pronto !== null) {
    return (
      <main className="demanda-page">
        <div className="demanda-sheet">
          <header className="demanda-header">
            <Marca />
          </header>

          <div className="demanda-card" style={{ alignItems: "center", textAlign: "center", gap: "0.75rem" }}>
            {/* O certo dentro de um disco na cor da marca: o aviso precisa se
                ler de longe, porque é a única coisa nesta tela. */}
            <span
              aria-hidden="true"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "48px",
                height: "48px",
                borderRadius: "var(--radius-pill)",
                background: "var(--primary-glow)",
                color: "var(--primary)",
              }}
            >
              <Check size={26} />
            </span>

            <h1 className="demanda-titulo">Demanda recebida</h1>

            {/* O número é o que a pessoa leva embora: é por ele que ela vai
                perguntar o andamento depois. */}
            {pronto && (
              <>
                <span
                  style={{
                    fontSize: "var(--text-metric)",
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    padding: "0.35rem 0.9rem",
                    borderRadius: "var(--radius-pill)",
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--surface-sunken-border)",
                  }}
                >
                  {pronto}
                </span>
                <p className="field-hint" style={{ margin: 0 }}>
                  Guarde esse número para acompanhar a demanda com a equipe.
                </p>
              </>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: "0.5rem" }}
              onClick={() => {
                setPronto(null);
                setTitulo("");
                setBriefing("");
                setPrioridade("MEDIA");
                setPrazo("");
                setLink("");
                setValores({});
              }}
            >
              Abrir outra demanda
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="demanda-page">
      <div className="demanda-sheet">
        <header className="demanda-header">
          <Marca />
          <h1 className="demanda-titulo">{board.name}</h1>
          <p className="field-hint" style={{ margin: 0, maxWidth: "46ch" }}>
            {board.description || "Preencha os campos abaixo para abrir uma demanda."}
          </p>
        </header>

        {/*
          `<form>` de verdade, e não uma pilha de campos com um botão ao lado:
          é o que faz o Enter enviar, o navegador oferecer o preenchimento
          automático e o leitor de tela anunciar que ali se preenche algo.
        */}
        <form
          className="demanda-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!enviando && !faltando) enviar();
          }}
        >
          <section className="demanda-secao">
            <span className="demanda-eyebrow">Quem está pedindo</span>

            <div className="field">
              <label className="field-label" htmlFor="publico-email">
                Seu e-mail corporativo
                {obrigatorio}
              </label>
              <input
                id="publico-email"
                type="email"
                autoComplete="email"
                className="field-input"
                value={email}
                placeholder={`voce${ALLOWED_EMAIL_DOMAIN}`}
                onChange={(e) => setEmail(e.target.value)}
                style={emailInvalido ? { borderColor: "var(--danger)" } : undefined}
              />
              <span
                className="field-hint"
                style={emailInvalido ? { color: "var(--danger)" } : undefined}
              >
                {emailInvalido
                  ? CORPORATE_EMAIL_ERROR
                  : "É por ele que a equipe volta a falar com você sobre esta demanda."}
              </span>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="publico-nome">
                Seu nome
              </label>
              <input
                id="publico-nome"
                autoComplete="name"
                className="field-input"
                value={nome}
                placeholder="Como a equipe te chama"
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
          </section>

          <section className="demanda-secao">
            <span className="demanda-eyebrow">A demanda</span>

            <div className="field">
              <label className="field-label" htmlFor="publico-titulo">
                Título da demanda
                {obrigatorio}
              </label>
              <input
                id="publico-titulo"
                className="field-input"
                value={titulo}
                placeholder="Em uma linha: o que você precisa?"
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>

            {/*
              As de fábrica antes das do quadro, na mesma ordem do formulário de
              dentro: as duas portas levam à mesma demanda, e quem já preencheu
              uma não deveria ter de reaprender a outra.
            */}
            {pergunta("description") && (
              <div className="field">
                <label className="field-label" htmlFor="publico-briefing">
                  Briefing
                </label>
                <textarea
                  id="publico-briefing"
                  className="field-input field-prose"
                  value={briefing}
                  placeholder="O que quem for produzir precisa saber antes de começar."
                  onChange={(e) => setBriefing(e.target.value)}
                />
              </div>
            )}

            {pergunta("priority") && (
              <div className="field">
                <span className="field-label">Prioridade</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {PRIORITIES.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className="btn btn-toggle"
                      aria-pressed={prioridade === p}
                      style={{ padding: "0.35rem 0.7rem", fontSize: "var(--text-caption)" }}
                      onClick={() => setPrioridade(p)}
                    >
                      {PRIORITY_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pergunta("dueDate") && (
              <div className="field">
                <label className="field-label" htmlFor="publico-prazo">
                  Para quando
                </label>
                <DatePicker
                  id="publico-prazo"
                  value={prazo}
                  onChange={setPrazo}
                  placeholder="Sem prazo"
                />
              </div>
            )}

            {/* Um campo de texto, e não o seletor de link do quadro: aquele conhece
                as pastas do time e mora dentro da sessão. Aqui basta um endereço. */}
            {pergunta("linkUrl") && (
              <div className="field">
                <label className="field-label" htmlFor="publico-link">
                  Link de referência
                </label>
                <input
                  id="publico-link"
                  type="url"
                  className="field-input"
                  value={link}
                  placeholder="https://drive.google.com/…"
                  onChange={(e) => setLink(e.target.value)}
                />
                <span className="field-hint">A pasta ou o material de apoio, se já existir.</span>
              </div>
            )}
          </section>

          {/* As perguntas do quadro ganham seção própria só quando existem:
              um título de seção sobre o vazio é uma promessa não cumprida. */}
          {board.fields.length > 0 && (
            <section className="demanda-secao">
              <span className="demanda-eyebrow">Detalhes do pedido</span>

              {camposVisiveis(board.fields, valores).map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={valores[field.key]}
                  values={valores}
                  parentLabel={board.fields.find((f) => f.key === field.dependsOn)?.label}
                  /*
                    Sem `upload` de propósito: aqui o campo é só link.

                    Este formulário é aberto por LINK PÚBLICO, por quem não tem
                    conta na plataforma, e as rotas de envio exigem sessão de
                    criador. Passar o contexto de envio desenharia um botão que
                    não pode funcionar — e fazê-lo funcionar significaria abrir
                    um caminho de upload não autenticado para o Drive do
                    Marketing, o que é outro assunto e outra decisão.
                  */
                  onChange={(v) =>
                    setValores((atuais) => {
                      const proximo = { ...atuais, [field.key]: v };
                      // Trocar o pai invalida o filho: as opções dele mudaram, e manter
                      // a resposta antiga gravaria uma combinação que não existe.
                      for (const outro of board.fields) {
                        if (outro.dependsOn === field.key) delete proximo[outro.key];
                      }
                      // E o que ela escondeu sai junto — ver `limparRespostasOcultas`.
                      return limparRespostasOcultas(board.fields, proximo);
                    })
                  }
                />
              ))}
            </section>
          )}

          <footer className="demanda-rodape">
            <span className="field-hint" role={erro ? "alert" : undefined} style={erro ? { color: "var(--danger)" } : undefined}>
              {erro ?? (faltando ? "Os campos com * são obrigatórios." : "Tudo pronto para enviar.")}
            </span>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={enviando || faltando}
              title={faltando ? "Preencha os campos obrigatórios" : "Enviar a demanda"}
            >
              {enviando ? "Enviando…" : "Enviar demanda"}
            </button>
          </footer>
        </form>

        <p className="field-hint demanda-nota">
          Este formulário é aberto: você não precisa de conta para usá-lo.
        </p>
      </div>
    </main>
  );
}
