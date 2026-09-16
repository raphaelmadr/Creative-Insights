const fs = require('fs');
const PROGRESS_FILE = "test_progress.json";
function saveProgressDate(month, year, date) {
  let data = {};
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
    } catch (e) {}
  }
  const key = `${year}-${month}`;
  data[key] = date.toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2), "utf8");
}
saveProgressDate(7, 2026, new Date("2026-07-02T03:00:00.000Z"));
console.log(fs.readFileSync(PROGRESS_FILE, "utf8"));
