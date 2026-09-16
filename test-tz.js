process.env.TZ = "America/Sao_Paulo";
const d = new Date(2026, 6, 1); // 2026-07-01 00:00:00 BRT
console.log("Original:", d.toISOString());
d.setDate(d.getDate() + 1);
console.log("After setDate 1:", d.toISOString());
d.setDate(d.getDate() + 1);
console.log("After setDate 2:", d.toISOString());
