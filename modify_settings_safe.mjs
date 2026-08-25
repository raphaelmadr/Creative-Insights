import fs from 'fs';

let content = fs.readFileSync('components/SettingsModal.tsx', 'utf8');

// 1. Rename 'Metas de Performance' to 'Metas & Equipe'
content = content.replace('Metas de Performance\n              </button>', 'Metas & Equipe\n              </button>');

// 2. Remove the Equipe tab button safely by string replacement
const btnStr = `              <button 
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
              </button>`;

if (content.includes(btnStr)) {
    content = content.replace(btnStr, '');
} else {
    console.error("Could not find equipe button exactly.");
    process.exit(1);
}

// 3. Extract the activeTab === "equipe" contents exactly.
const equipeStartStr = `            {activeTab === "equipe" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                
                <div style={{ background: "var(--background-main)", borderRadius: "12px", border: "1px solid var(--card-border)", padding: "1.5rem" }}>`;

const equipeStartIdx = content.indexOf(`            {activeTab === "equipe" && (`);
if (equipeStartIdx === -1) {
    console.error("Could not find activeTab === 'equipe'");
    process.exit(1);
}

// The activeTab === "equipe" block ends right before the `<button type="submit"` block.
// So let's find the `</form>` submit button block.
const submitBtnIdx = content.indexOf(`            <button type="submit" disabled={loading} style={{`);
if (submitBtnIdx === -1) {
    console.error("Could not find submit button");
    process.exit(1);
}

// The entire block from `equipeStartIdx` to `submitBtnIdx` is what we want to move, MINUS the `            {activeTab === "equipe" && (\n              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>\n` at the top, and `\n              </div>\n            )}\n\n` at the bottom.
const fullEquipeBlock = content.substring(equipeStartIdx, submitBtnIdx);

// The actual inner content is:
const innerEquipe = fullEquipeBlock
    .replace('            {activeTab === "equipe" && (\n              <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>\n                \n', '')
    .replace(/\n              <\/div>\n            \)\}\n\n\s*$/, '\n');

// 4. Delete the full equipe block from its original position
content = content.replace(fullEquipeBlock, '\n');

// 5. Inject innerEquipe at the end of activeTab === "metas" block
// The metas block ends with:
const metasEndStr = `                  </div>
                </div>
              </>
            )}

            {activeTab === "ia"`;

if (content.includes(metasEndStr)) {
    content = content.replace(metasEndStr, `                  </div>
                </div>

${innerEquipe}
              </>
            )}

            {activeTab === "ia"`);
} else {
    console.error("Could not find metas end string");
    process.exit(1);
}

fs.writeFileSync('components/SettingsModal.tsx', content);
console.log("Done successfully.");
