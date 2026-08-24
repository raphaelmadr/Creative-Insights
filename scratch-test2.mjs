import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const run = async () => {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await res.json();
    console.log(data.models.map(m => m.name));
  } catch(e) {
    console.error(e);
  }
}
run();
