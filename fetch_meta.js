require("dotenv").config({ path: ".env.local" });

async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  const url = `https://graph.facebook.com/v19.0/${account}/ads?fields=insights.date_preset(last_30d){actions,action_values}&access_token=${token}&limit=20`;
  const res = await fetch(url);
  const data = await res.json();
  const fs = require("fs");
  fs.writeFileSync("raw_actions.json", JSON.stringify(data, null, 2));
}

run();
