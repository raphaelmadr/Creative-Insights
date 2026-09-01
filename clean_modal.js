const fs = require('fs');
let content = fs.readFileSync('/Users/raphael/Desktop/Creative Insights/components/SettingsModal.tsx', 'utf8');

// Find activeTab === "metas_mensais" block
let metasMensaisIdx = content.indexOf('{activeTab === "metas_mensais" && (');
if (metasMensaisIdx !== -1) {
  let depth = 0;
  let endIdx = -1;
  for (let i = metasMensaisIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        // Need to capture the closing parenthesis too ")}"
        endIdx = content.indexOf(')}', i) + 2;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    content = content.substring(0, metasMensaisIdx) + content.substring(endIdx);
  }
}

// Find activeTab === "metas" block
let metasIdx = content.indexOf('{activeTab === "metas" && (');
if (metasIdx !== -1) {
  let depth = 0;
  let endIdx = -1;
  for (let i = metasIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = content.indexOf(')}', i) + 2;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    content = content.substring(0, metasIdx) + content.substring(endIdx);
  }
}

// Find activeTab === "equipe" block
let equipeIdx = content.indexOf('{activeTab === "equipe" && (');
if (equipeIdx !== -1) {
  let depth = 0;
  let endIdx = -1;
  for (let i = equipeIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = content.indexOf(')}', i) + 2;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    content = content.substring(0, equipeIdx) + content.substring(endIdx);
  }
}

fs.writeFileSync('/Users/raphael/Desktop/Creative Insights/components/SettingsModal.tsx', content);
