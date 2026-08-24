import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

async function run() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  try {
    const result = await model.generateContent("Hello!");
    console.log("gemini-1.5-flash-latest:", result.response.text());
  } catch (e) {
    console.error("gemini-1.5-flash-latest error:", e.message);
  }

  const model2 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  try {
    const result = await model2.generateContent("Hello!");
    console.log("gemini-1.5-flash:", result.response.text());
  } catch (e) {
    console.error("gemini-1.5-flash error:", e.message);
  }
}
run();
