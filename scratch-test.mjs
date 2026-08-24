import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const run = async () => {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  try {
    const result = await model.generateContent("Hello");
    console.log("pro works", result.response.text());
  } catch(e) {
    console.error("pro error:", e.message);
  }
}
run();
