import fs from 'fs';

let content = fs.readFileSync('components/SettingsModal.tsx', 'utf8');

// 1. Rename the 'Metas de Performance' tab to 'Metas & Equipe'
content = content.replace('Metas de Performance\n              </button>', 'Metas & Equipe\n              </button>');

// 2. Remove the 'Equipe' tab button
const equipeBtnRegex = /<button[\s\S]*?onClick=\{\(\) => setActiveTab\("equipe"\)\}[\s\S]*?Equipe\n\s*<\/button>/;
content = content.replace(equipeBtnRegex, '');

// 3. Extract the contents inside activeTab === "equipe"
const equipeContentRegex = /\{activeTab === "equipe" && \(\n\s*<div style=\{\{ display: "flex", flexDirection: "column", gap: "1\.5rem" \}\}>\n\s*([\s\S]*?)\n\s*<\/div>\n\s*\)\}/;
const match = content.match(equipeContentRegex);
if (!match) {
    console.error("Failed to find equipe content");
    process.exit(1);
}
const equipeInner = match[1];

// 4. Delete the activeTab === "equipe" block
content = content.replace(equipeContentRegex, '');

// 5. Inject equipeInner into activeTab === "metas"
// We find the end of activeTab === "metas", which is `</>\n            )}`
const metasEndRegex = /<\/div>\n\s*<\/div>\n\s*<\/>\n\s*\)\}/;
content = content.replace(metasEndRegex, `</div>\n                </div>\n\n                ${equipeInner}\n              </>\n            )}`);

fs.writeFileSync('components/SettingsModal.tsx', content);
console.log("Done");
