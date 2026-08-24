import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import TopBar from "@/components/TopBar";
import { ArrowLeft, Sparkles } from "lucide-react";
import AnalysisHeader from "@/components/AnalysisHeader";
import SafeImage from "@/components/SafeImage";
import ReactMarkdown from "react-markdown";

interface AnalysisItem {
  title: string;
  content: string;
  urgency: string;
  category: string;
  adName?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

function getUrgencyColor(urgency: string) {
  switch (urgency?.toLowerCase()) {
    case "alta": return "var(--destructive)";
    case "média":
    case "media": return "var(--warning)";
    case "baixa": return "var(--success)";
    default: return "var(--primary)";
  }
}

export default async function CampaignAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const analysis = await prisma.campaignAnalysis.findUnique({ where: { id } });
  if (!analysis) notFound();

  let items: AnalysisItem[] = [];
  try {
    items = JSON.parse(analysis.items);
  } catch {
    items = [];
  }

  // Fetch updated creative URLs
  const adNames = Array.from(new Set(items.map(i => i.adName).filter(Boolean) as string[]));
  const creatives = await prisma.adCreative.findMany({
    where: { adName: { in: adNames } },
    select: { adName: true, imageUrl: true, thumbnailUrl: true }
  });
  const creativeMap = new Map();
  creatives.forEach(c => creativeMap.set(c.adName, c.imageUrl || c.thumbnailUrl));

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TopBar />
      <div style={{ padding: "2rem", display: "flex", flexDirection: "column", flex: 1, maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        <Link
          href="/analises"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", opacity: 0.7, marginBottom: "1.5rem", textDecoration: "none", color: "var(--foreground)" }}
        >
          <ArrowLeft size={18} />
          Voltar às análises
        </Link>

        <AnalysisHeader analysis={analysis} />

        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem", opacity: 0.5 }}>
            Nenhum insight foi gerado nesta análise.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {items.map((item, idx) => {
              const currentThumb = (item.adName && creativeMap.get(item.adName));
              const thumb = currentThumb || item.imageUrl || item.thumbnailUrl || null;
              return (
                <div
                  key={idx}
                  className="glass-panel"
                  style={{ padding: "1.5rem", display: "flex", gap: "1.25rem", borderLeft: `4px solid ${getUrgencyColor(item.urgency)}` }}
                >
                  <div style={{
                    flexShrink: 0,
                    width: 96,
                    height: 96,
                    borderRadius: "0.75rem",
                    overflow: "hidden",
                    background: "rgba(255,255,255,0.05)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    {thumb ? (
                      <div style={{ position: "relative", width: "100%", height: "100%" }}>
                        <SafeImage src={thumb} alt={item.adName || "Criativo"} fill style={{ objectFit: "cover" }} />
                      </div>
                    ) : (
                      <Sparkles size={24} opacity={0.3} />
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.25rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: getUrgencyColor(item.urgency) + "20",
                        color: getUrgencyColor(item.urgency),
                        border: `1px solid ${getUrgencyColor(item.urgency)}40`
                      }}>
                        Urgência: {item.urgency}
                      </span>
                      <span style={{
                        padding: "0.25rem 0.5rem",
                        borderRadius: "0.25rem",
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        backgroundColor: "var(--primary)20",
                        color: "var(--primary)",
                        border: "1px solid var(--primary)40"
                      }}>
                        {item.category}
                      </span>
                      {item.adName && (
                        <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>{item.adName}</span>
                      )}
                    </div>

                    <h3 style={{ fontSize: "1.25rem" }}>{item.title}</h3>
                    <div className="prose prose-invert max-w-none" style={{ opacity: 0.8, lineHeight: 1.6 }}>
                      <ReactMarkdown>{item.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
