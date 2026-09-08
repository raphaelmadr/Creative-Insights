const d = new Date("2026-08-01T03:00:00.000Z");
console.log("Original Date:", d.toISOString());
console.log("split T:", d.toISOString().split('T')[0]);
d.setDate(d.getDate() + 1);
console.log("After setDate +1:", d.toISOString());
console.log("split T:", d.toISOString().split('T')[0]);
