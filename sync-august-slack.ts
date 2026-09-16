import { POST } from "./app/api/sync-slack/route";

async function main() {
  console.log("Sincronizando entregas do Slack para AGOSTO de 2026 (fullMonth)...");
  
  const req = new Request("http://localhost:3000/api/sync-slack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month: 8, year: 2026, fullMonth: true })
  });

  try {
    const res = await POST(req);
    console.log("Status HTTP:", res.status);
    const data = await res.json();
    console.log("Resposta da API:", data);
  } catch (err) {
    console.error("Erro na execução:", err);
  }
}

main();
