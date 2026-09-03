import fs from 'fs';

let content = fs.readFileSync('components/CreativeView.tsx', 'utf-8');

// 1. Update data type
content = content.replace(
  /const data: \{superWinners: any\[\], winners: any\[\], testes: Record<string, any\[\]>, settings\?: any\} \| null = fetchRes\?\.success \? fetchRes\.data : null;/,
  `const data: {categorizedAds: any[], testes: Record<string, any[]>, settings?: any} | null = fetchRes?.success ? fetchRes.data : null;`
);

// 2. Update state variables
content = content.replace(
  /const \[superWinnersVisible, setSuperWinnersVisible\] = useState\(PAGE_SIZE\);\n  const \[winnersVisible, setWinnersVisible\] = useState\(PAGE_SIZE\);/,
  `const [categoriesVisible, setCategoriesVisible] = useState<Record<string, number>>({});`
);

content = content.replace(
  /const \[isSuperWinnersCollapsed, setIsSuperWinnersCollapsed\] = useState\(false\);\n  const \[isWinnersCollapsed, setIsWinnersCollapsed\] = useState\(false\);/,
  `const [categoriesCollapsed, setCategoriesCollapsed] = useState<Record<string, boolean>>({});`
);

content = content.replace(
  /setSuperWinnersVisible\(PAGE_SIZE\);\n    setWinnersVisible\(PAGE_SIZE\);/,
  `setCategoriesVisible({});`
);

// 3. Update filtering logic
content = content.replace(
  /const baseSuperWinners = [^;]+;\n  const baseWinners = [^;]+;/,
  `const baseCategories = React.useMemo(() => data && data.categorizedAds ? data.categorizedAds.map(cat => ({ ...cat, ads: cat.ads.filter(c => filterByDesigner(c) && filterByChannel(c)) })) : [], [data, filterByDesigner, filterByChannel]);`
);

content = content.replace(
  /const filteredSuperWinners = [^;]+;\n  const filteredWinners = [^;]+;/,
  `const filteredCategories = React.useMemo(() => baseCategories.map(cat => ({ ...cat, ads: cat.ads.filter(filterByDate) })), [baseCategories, filterByDate]);`
);

// 4. Update metrics logic
content = content.replace(
  /console\.log\("data size:", data\.superWinners\.length, data\.winners\.length\); console\.log\("filtered size:", filteredSuperWinners\.length, filteredWinners\.length\);/,
  `console.log("data size:", data.categorizedAds?.length); console.log("filtered size:", filteredCategories.length);`
);

content = content.replace(
  /baseSuperWinners\.filter\(filterForMetrics\)\.forEach\(processCreative\);\n      baseWinners\.filter\(filterForMetrics\)\.forEach\(processCreative\);/,
  `baseCategories.forEach(cat => cat.ads.filter(filterForMetrics).forEach(processCreative));`
);

// 5. Update global controls
content = content.replace(
  /const isEverythingCollapsed = isSuperWinnersCollapsed && isWinnersCollapsed && isTestesCollapsed && \(allAdSets\.length === 0 \|\| allGroupsCollapsed\);/,
  `const allCatsCollapsed = filteredCategories.every(cat => categoriesCollapsed[cat.id]);\n              const isEverythingCollapsed = allCatsCollapsed && isTestesCollapsed && (allAdSets.length === 0 || allGroupsCollapsed);`
);

content = content.replace(
  /setIsSuperWinnersCollapsed\(false\);\n                setIsWinnersCollapsed\(false\);/,
  `setCategoriesCollapsed({});`
);

content = content.replace(
  /setIsSuperWinnersCollapsed\(true\);\n                setIsWinnersCollapsed\(true\);/,
  `const newCatsState: Record<string, boolean> = {};\n                filteredCategories.forEach(cat => newCatsState[cat.id] = true);\n                setCategoriesCollapsed(newCatsState);`
);

content = content.replace(
  /isSuperWinnersCollapsed && isWinnersCollapsed/,
  `filteredCategories.every(cat => categoriesCollapsed[cat.id])`
);

// 6. Replace Glossary and Sections in return statement
// Find the start of glossary
const glossaryStart = content.indexOf(`{/* Glossário / Informações (Dashboard) */}`);
const controlsStart = content.indexOf(`{/* Controles Globais */}`);
if (glossaryStart !== -1 && controlsStart !== -1) {
  content = content.substring(0, glossaryStart) + `
          {/* Glossário / Informações (Dashboard) */}
            {data?.categorizedAds && (
              <div className="fixed-grid-4" style={{ marginBottom: "1rem" }}>
                {data.categorizedAds.map((cat, idx) => (
                  <div key={cat.id} className={\`allu-card \${idx === 0 ? 'allu-card-highlight' : ''}\`}>
                    <div className="allu-card-label" style={{ color: cat.color }}>▶ {cat.name.toUpperCase()}</div>
                    <div className="allu-card-subtext">
                      Critérios variam por plataforma (Meta, TikTok, Google). Consulte as regras em Configurações.
                    </div>
                  </div>
                ))}
                <div className="allu-card">
                  <div className="allu-card-label">◇ ÁREA DE TESTES</div>
                  <div className="allu-card-subtext">
                    Anúncios em validação agrupados por conjunto. Podem ou não ter atingido as métricas de Winner ainda.
                  </div>
                </div>
                <div className="allu-card">
                  <div className="allu-card-label">◇ FILTRO DE VEICULAÇÃO</div>
                  <div className="allu-card-subtext">
                    Exibindo e calculando estritamente métricas de anúncios com status 
                    <strong> {statusFilter === 'INACTIVE' ? 'DESATIVADO' : statusFilter === 'ALL' ? 'ATIVO E DESATIVADO' : 'ATIVO'} </strong> 
                    atualmente na Meta Ads.
                  </div>
                </div>
              </div>
            )}
` + content.substring(controlsStart);
}

// 7. Replace Sections
const testesSectionStart = content.indexOf(`{/* Seção Testes`);
const superWinnersSectionStart = content.indexOf(`{/* Seção Super Winners */}`);

if (superWinnersSectionStart !== -1 && testesSectionStart !== -1) {
  content = content.substring(0, superWinnersSectionStart) + `
      {/* Categorias Dinâmicas */}
      {filteredCategories.map((cat, idx) => {
        const isCollapsed = categoriesCollapsed[cat.id] || false;
        const visibleCount = categoriesVisible[cat.id] || PAGE_SIZE;
        const numStr = (idx + 2).toString().padStart(2, '0');
        
        return (
          <section key={cat.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem", marginBottom: "1rem" }}>
              <div className="section-header" style={{ marginBottom: 0 }}>
                <span className="section-number" style={{ color: cat.color }}>{numStr}</span>
                <h2 className="section-title" style={{ color: cat.color }}>{cat.name.toLowerCase()} ({cat.ads.length})</h2>
                <span className="section-subtitle">regras baseadas em plataforma</span>
              </div>
              <button 
                onClick={() => setCategoriesCollapsed(prev => ({ ...prev, [cat.id]: !isCollapsed }))}
                style={{ fontSize: "0.8rem", opacity: 0.7, cursor: "pointer", textDecoration: "underline", display: "flex", alignItems: "center", gap: "0.25rem" }}
              >
                {isCollapsed ? <><ChevronRight size={14} /> Expandir</> : <><ChevronDown size={14} /> Recolher</>}
              </button>
            </div>

            {!isCollapsed && (
              cat.ads.length === 0 ? (
                <p style={{ opacity: 0.5 }}>Nenhum criativo {cat.name} no período selecionado.</p>
              ) : (
                <>
                  <motion.div 
                    className={styles.grid}
                    initial="hidden" animate="show"
                    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                  >
                    {cat.ads.slice(0, visibleCount).map((c: any) => renderCreativeCard(c, "super"))}
                  </motion.div>
                  {cat.ads.length > visibleCount && (
                    <InfiniteScrollTrigger
                      remaining={cat.ads.length - visibleCount}
                      onLoadMore={() => setCategoriesVisible(prev => ({ ...prev, [cat.id]: (prev[cat.id] || PAGE_SIZE) + PAGE_SIZE }))}
                    />
                  )}
                </>
              )
            )}
          </section>
        );
      })}

      ` + content.substring(testesSectionStart);
}

// 8. Fix dependency array in useEffect for metrics
content = content.replace(
  /\[baseSuperWinners, baseWinners, baseTestes, data, dateFrom, dateTo, onMetricsUpdate\]/,
  `[baseCategories, baseTestes, data, dateFrom, dateTo, onMetricsUpdate]`
);

fs.writeFileSync('components/CreativeView.tsx', content, 'utf-8');
console.log("CreativeView.tsx rewritten successfully");
