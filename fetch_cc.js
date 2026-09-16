require("dotenv").config({ path: ".env.local" });

async function run() {
  const token = process.env.META_ACCESS_TOKEN;
  const account = process.env.META_AD_ACCOUNT_ID;
  const url = `https://graph.facebook.com/v19.0/${account}/customconversions?fields=name,id&access_token=${token}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
