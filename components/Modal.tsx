"use client";

import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/**
 * O diálogo em que os formulários da plataforma vivem.
 *
 * Regra do projeto: formulário não fica aberto na página — abre por um botão.
 * O cadastro de membro ocupava meia tela de configurações o tempo todo, mesmo
 * para quem só queria conferir a lista de quem já está na equipe.
 *
 * Cuida do que um formulário em camada precisa e que é fácil esquecer: fecha no
 * Esc e no clique fora, trava a rolagem de trás, devolve o foco a quem abriu e
 * leva o foco para dentro ao abrir — sem isso o teclado continua navegando a
 * página escondida atrás.
 */
export default function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = "min(680px, 100%)",
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const abriuCom = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    abriuCom.current = document.activeElement as HTMLElement;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", aoTeclar);

    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // O primeiro campo é onde a pessoa vai digitar; levar o foco até ele evita
    // que o teclado continue na página de trás.
    const alvo = painel.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), select, textarea, button"
    );
    alvo?.focus();

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
      abriuCom.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        ref={painel}
        className="modal-panel"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
      >
        <header className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h2 className="modal-title">{title}</h2>
            {description && <p className="field-hint">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-close"
            title="Fechar (Esc)"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </header>

        <div className="modal-body">{children}</div>

        {footer && <footer className="modal-footer">{footer}</footer>}
      </motion.div>
    </div>,
    document.body
  );
}
