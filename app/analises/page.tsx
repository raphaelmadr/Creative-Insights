import Link from "next/link";
import prisma from "@/lib/prisma";
import TopBar from "@/components/TopBar";
import { Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import SafeImage from "@/components/SafeImage";

interface AnalysisItem {
  title: string;
  content: string;
  urgency: string;
  category: string;
  adName?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export default async function AnalisesListPage() {
  const analyses = await prisma.campaignAnalysis.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Extract all ad names to fetch up-to-date image URLs
  const allAdNames = Array.from(new Set(analyses.flatMap(a => {
    try {
      const items = JSON.parse(a.items);
      return items.map((i: any) => i.adName).filter(Boolean);
    } catch {
      return [];
    }
  })));

  const creatives = await prisma.adCreative.findMany({
    where: { adName: { in: allAdNames as string[] } },
    select: { adName: true, imageUrl: true, thumbnailUrl: true }
  });

  const creativeMap = new Map();
  creatives.forEach(c => creativeMap.set(c.adName, c.imageUrl || c.thumbnailUrl));

  const parsed = analyses.map((analysis) => {
    let items: AnalysisItem[] = [];
    try {
      items = JSON.parse(analysis.items);
    } catch {
      items = [];
    }

    const thumbs = Array.from(
      new Set(items.map((i) => (i.adName && creativeMap.get(i.adName)) || i.imageUrl || i.thumbnailUrl).filter(Boolean) as string[])
    ).slice(0, 4);

    return { 
      id: analysis.id, 
      createdAt: analysis.createdAt, 
      title: analysis.title,
      resolved: analysis.resolved,
      itemCount: items.length, 
      thumbs 
    };
  });

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div style={{ padding: "2rem", display: "flex", flexDirection: "column", flex: 1, maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "2rem" }} className="gradient-text">
            <Sparkles size={28} color="var(--primary)" />
            Análises de Campanhas
          </h1>
          <p style={{ opacity: 0.7, marginTop: "0.5rem" }}>
            Histórico de análises geradas a partir do botão "Analisar Minhas Campanhas".
          </p>
        </div>

        {parsed.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", opacity: 0.5 }}>
            Nenhuma análise gerada ainda.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.5rem" }}>
            {parsed.map((analysis) => (
              <Link
                key={analysis.id}
                href={`/analises/${analysis.id}`}
                className="glass-panel hover-glow"
                style={{
                  padding: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                  textDecoration: "none",
                  color: "var(--foreground)",
                  position: "relative"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                  <div style={{ display: "flex" }}>
                    {analysis.thumbs.length > 0 ? (
                      analysis.thumbs.map((thumb, idx) => (
                        <div key={idx} style={{
                          width: 48,
                          height: 48,
                          borderRadius: "0.5rem",
                          border: "2px solid var(--background)",
                          marginLeft: idx === 0 ? 0 : -16,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                          overflow: "hidden",
                          position: "relative",
                          flexShrink: 0,
                          backgroundColor: "var(--card-bg)"
                        }}>
                          <SafeImage
                            src={thumb}
                            alt="Criativo analisado"
                            style={{ objectFit: "cover", width: "100%", height: "100%" }}
                          />
                        </div>
                      ))
                    ) : (
                      <div style={{
                        width: 48, height: 48, borderRadius: "0.5rem",
                        background: "rgba(255,255,255,0.05)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        <Sparkles size={20} opacity={0.3} />
                      </div>
                    )}
                  </div>
                  <ChevronRight size={20} opacity={0.5} style={{ marginTop: "0.5rem" }} />
                </div>

                <div style={{ marginTop: "auto" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", lineHeight: 1.3 }}>
                    {analysis.title || `Análise de ${new Date(analysis.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`}
                    {analysis.resolved && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "100px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 700 }}>
                        <CheckCircle2 size={12} />
                        RESOLVIDA
                      </span>
                    )}
                  </h3>
                  <p style={{ fontSize: "0.85rem", opacity: 0.6, marginTop: "0.5rem", margin: 0 }}>
                    {new Date(analysis.createdAt).toLocaleDateString("pt-BR")} às {new Date(analysis.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {analysis.itemCount} insight{analysis.itemCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
