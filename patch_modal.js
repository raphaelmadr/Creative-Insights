const fs = require('fs');
let content = fs.readFileSync('/Users/raphael/Desktop/Creative Insights/components/SettingsModal.tsx', 'utf8');

// Update activeTab type and initial state
content = content.replace(
  `const [activeTab, setActiveTab] = useState<"sistema" | "metas" | "metas_mensais" | "ia" | "api" | "equipe" | "logs">("sistema");`,
  `const [activeTab, setActiveTab] = useState<"sistema" | "ia" | "api" | "logs">("sistema");`
);

// Remove tabs from header
content = content.replace(
  `<button 
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
              </button>`,
  ``
);

content = content.replace(
  `<button 
                type="button" 
                onClick={() => setActiveTab("equipe")}
                style={{ 
                  background: "none", border: "none", cursor: "pointer", 
                  fontWeight: activeTab === "equipe" ? 600 : 400,
                  color: activeTab === "equipe" ? "var(--foreground)" : "var(--foreground-muted)",
                  borderBottom: activeTab === "equipe" ? "2px solid var(--foreground)" : "2px solid transparent",
                  paddingBottom: "0.5rem", marginBottom: "-0.5rem"
                }}>
                Equipe
              </button>`,
  ``
);

// We should remove the conditional rendering blocks for activeTab === "metas", "metas_mensais", "equipe"
// We can use regex to remove them, but it's safer to just replace them manually or use a script that finds the blocks.
fs.writeFileSync('/Users/raphael/Desktop/Creative Insights/components/SettingsModal.tsx', content);
