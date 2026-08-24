import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import prisma from "./prisma";

export type AiImageInput = {
  base64: string;
  mimeType: string;
};

const modelCache: Record<string, { modelId: string; expiresAt: number }> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getCachedModel(provider: string, fetcher: () => Promise<string>, defaultModel: string): Promise<string> {
  const now = Date.now();
  if (modelCache[provider] && modelCache[provider].expiresAt > now) {
    return modelCache[provider].modelId;
  }
  try {
    const modelId = await fetcher();
    if (modelId) {
      modelCache[provider] = { modelId, expiresAt: now + CACHE_TTL };
      return modelId;
    }
  } catch (error) {
    console.warn(`[Discovery] Failed to fetch model for ${provider}, using default.`, error);
  }
  return defaultModel;
}

// Discovery functions
async function getBestGeminiModel(apiKey: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error("Failed to fetch Gemini models");
  const data = await res.json();
  const models = data.models || [];
  // Procura primeiro pelo gemini-3.6-flash, se não achar cai pro primeiro flash disponível
  const flash36 = models.find((m: any) => m.name.includes("gemini-3.6-flash"));
  if (flash36) return flash36.name.replace('models/', '');
  
  const flashModel = models.find((m: any) => m.name.includes("flash"));
  return flashModel ? flashModel.name.replace('models/', '') : "gemini-3.6-flash";
}

async function getBestGroqModel(apiKey: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error("Failed to fetch Groq models");
  const data = await res.json();
  const models = data.data || [];
  const validModels = models.filter((m: any) => !m.id.includes("whisper") && !m.id.includes("prompt-guard"));
  const preferred = validModels.find((m: any) => m.id.toLowerCase().includes("llama") || m.id.toLowerCase().includes("mixtral") || m.id.toLowerCase().includes("qwen"));
  return preferred ? preferred.id : (validModels[0]?.id || "qwen/qwen3.6-27b");
}

async function getBestOpenRouterModel(): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error("Failed to fetch OpenRouter models");
  const data = await res.json();
  const models = data.data || [];
  const freeModels = models.filter((m: any) => m.pricing?.prompt === "0" && m.id.includes("free"));
  return freeModels.length > 0 ? freeModels[0].id : "nvidia/nemotron-3.5-lightning:free";
}

async function getBestOpenAIModel(apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error("Failed to fetch OpenAI models");
  const data = await res.json();
  const models = data.data || [];
  const has4oMini = models.find((m: any) => m.id === "gpt-4o-mini");
  if (has4oMini) return "gpt-4o-mini";
  const has35Turbo = models.find((m: any) => m.id === "gpt-3.5-turbo");
  if (has35Turbo) return "gpt-3.5-turbo";
  return models[0]?.id || "gpt-4o-mini";
}

async function getBestAnthropicModel(apiKey: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: { 
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    }
  });
  if (!res.ok) throw new Error("Failed to fetch Anthropic models");
  const data = await res.json();
  const models = data.data || [];
  const hasSonnet = models.find((m: any) => m.id.includes("claude-3-5-sonnet"));
  if (hasSonnet) return hasSonnet.id;
  const hasHaiku = models.find((m: any) => m.id.includes("claude-3-haiku") || m.id.includes("claude-3-5-haiku"));
  return hasHaiku ? hasHaiku.id : "claude-3-5-sonnet-20240620";
}

async function getBestCohereModel(apiKey: string): Promise<string> {
  const res = await fetch("https://api.cohere.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) throw new Error("Failed to fetch Cohere models");
  const data = await res.json();
  const models = data.models || [];
  const commandR = models.find((m: any) => m.name.includes("command-r"));
  return commandR ? commandR.name : "command-r-plus";
}

async function getBestHuggingFaceModel(): Promise<string> {
  const res = await fetch("https://huggingface.co/api/models?pipeline_tag=text-generation&sort=downloads&direction=-1&limit=5");
  if (!res.ok) throw new Error("Failed to fetch Hugging Face models");
  const data = await res.json();
  return data.length > 0 ? data[0].modelId : "meta-llama/Meta-Llama-3-8B-Instruct";
}

/**
 * Generates text from prompt, with optional images, using a fallback mechanism.
 * Order of fallback: Gemini -> OpenAI -> Claude
 */
export async function generateWithFallback(prompt: string, images?: AiImageInput[]): Promise<string> {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } });
  
  const geminiKey = settings?.geminiApiKey;
  const groqKey = settings?.groqApiKey;
  const openRouterKey = settings?.openRouterApiKey;
  const openaiKey = settings?.openaiApiKey;
  const anthropicKey = settings?.anthropicApiKey;
  const cohereKey = settings?.cohereApiKey;
  const huggingFaceKey = settings?.huggingFaceApiKey;

  const hasGemini = !!geminiKey;
  const hasGroq = !!groqKey;
  const hasOpenRouter = !!openRouterKey;
  const hasOpenAI = !!openaiKey;
  const hasAnthropic = !!anthropicKey;
  const hasCohere = !!cohereKey;
  const hasHuggingFace = !!huggingFaceKey;

  if (!hasGemini && !hasGroq && !hasOpenRouter && !hasOpenAI && !hasAnthropic && !hasCohere && !hasHuggingFace) {
    return "Nenhuma inteligência artificial configurada no sistema. O sistema está funcionando em modo de fallback seguro. Para habilitar a geração de insights e hipóteses, adicione pelo menos uma chave de API no painel de configurações ou nas variáveis de ambiente.";
  }

  const errors: string[] = [];

  let finalResult: string | null = null;

  // 1. Try Gemini
  try {
    finalResult = await tryGemini(prompt, geminiKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] Gemini failed:", error);
    errors.push(`Gemini: ${error.message || "Erro desconhecido"}`);
  }

  // 2. Try Groq
  try {
    finalResult = await tryGroq(prompt, groqKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] Groq failed:", error);
    errors.push(`Groq: ${error.message || "Erro desconhecido"}`);
  }

  // 3. Try OpenRouter
  try {
    finalResult = await tryOpenRouter(prompt, openRouterKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] OpenRouter failed:", error);
    errors.push(`OpenRouter: ${error.message || "Erro desconhecido"}`);
  }

  // 4. Try OpenAI (GPT-4o)
  try {
    finalResult = await tryOpenAI(prompt, openaiKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] OpenAI failed:", error);
    errors.push(`OpenAI: ${error.message || "Erro desconhecido"}`);
  }

  // 5. Try Anthropic (Claude 3.5 Sonnet)
  try {
    finalResult = await tryAnthropic(prompt, anthropicKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] Anthropic failed:", error);
    errors.push(`Anthropic: ${error.message || "Erro desconhecido"}`);
  }

  // 6. Try Cohere
  try {
    finalResult = await tryCohere(prompt, cohereKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] Cohere failed:", error);
    errors.push(`Cohere: ${error.message || "Erro desconhecido"}`);
  }

  // 7. Try Hugging Face
  try {
    finalResult = await tryHuggingFace(prompt, huggingFaceKey as string, images);
    if (finalResult) return cleanAiOutput(finalResult);
  } catch (error: any) {
    console.error("[Fallback] Hugging Face failed:", error);
    errors.push(`HuggingFace: ${error.message || "Erro desconhecido"}`);
  }

  throw new Error(`Nenhuma IA disponível. Detalhes: ${errors.join(" | ")}`);
}

function cleanAiOutput(text: string): string {
  if (!text) return "";
  
  // Se o modelo obedeceu à instrução e envelopou a resposta final em <final_answer>
  const finalAnswerMatch = text.match(/<final_answer>([\s\S]*?)<\/final_answer>/i);
  if (finalAnswerMatch && finalAnswerMatch[1].trim().length > 0) {
    return finalAnswerMatch[1].trim();
  }

  // Fallback 1: Remove qualquer bloco explícito de tag <think>
  let cleaned = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim();

  // Fallback 2: Remove blocos textuais onde o modelo explica o raciocínio sem tag
  const thinkingTextRegex = /^(?:Here's a thinking process:|Thinking Process:|Pensamento:|Raciocínio:|\*?Thinking Process\*?|\*?Here's a thinking process\*?)[\s\S]*?(?=(?:^- |\n- |\n\n- |\n\*\*|\n\n\*\*))/im;
  cleaned = cleaned.replace(thinkingTextRegex, '').trim();

  return cleaned.length > 0 ? cleaned : text.replace(/<\/?think>/gi, '').trim();
}

// Alias to maintain compatibility with existing routes that used generateText
export const generateText = generateWithFallback;

async function tryGemini(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not found. Skipping Gemini.");
    return null;
  }

  const modelId = await getCachedModel("gemini", () => getBestGeminiModel(apiKey), "gemini-3.6-flash");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });

  let requestContent: any[] = [prompt];

  if (images && images.length > 0) {
    const imageParts = images.map((img) => ({
      inlineData: {
        data: img.base64,
        mimeType: img.mimeType,
      },
    }));
    requestContent = [prompt, ...imageParts];
  }

  const result = await model.generateContent(requestContent as any);
  return result.response.text().trim();
}

async function tryOpenAI(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not found. Skipping OpenAI.");
    return null;
  }

  const modelId = await getCachedModel("openai", () => getBestOpenAIModel(apiKey), "gpt-4o-mini");
  const openai = new OpenAI({ apiKey });

  let messageContent: any[] = [{ type: "text", text: prompt }];

  if (images && images.length > 0) {
    const imageParts = images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    }));
    messageContent = [...messageContent, ...imageParts];
  }

  const response = await openai.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content: messageContent }],
    max_tokens: 1024,
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

async function tryAnthropic(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not found. Skipping Anthropic.");
    return null;
  }

  const modelId = await getCachedModel("anthropic", () => getBestAnthropicModel(apiKey), "claude-3-5-sonnet-20240620");
  const anthropic = new Anthropic({ apiKey });

  let messageContent: any[] = [{ type: "text", text: prompt }];

  if (images && images.length > 0) {
    const imageParts = images.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mimeType as any,
        data: img.base64,
      },
    }));
    // Note: Anthropic expects text and images in the content array.
    messageContent = [...imageParts, { type: "text", text: prompt }];
  }

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 1024,
    messages: [{ role: "user", content: messageContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  return textBlock ? textBlock.text.trim() : null;
}

async function tryGroq(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("GROQ_API_KEY not found. Skipping Groq.");
    return null;
  }
  
  const modelId = await getCachedModel("groq", () => getBestGroqModel(apiKey), "qwen/qwen3.6-27b");
  const openai = new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
  let messageContent: any[] = [{ type: "text", text: prompt }];

  if (images && images.length > 0) {
    const imageParts = images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    }));
    messageContent = [...messageContent, ...imageParts];
  }

  const response = await openai.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content: messageContent }],
    max_tokens: 1024,
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

async function tryOpenRouter(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("OPENROUTER_API_KEY not found. Skipping OpenRouter.");
    return null;
  }

  const modelId = await getCachedModel("openrouter", () => getBestOpenRouterModel(), "nvidia/nemotron-3.5-lightning:free");
  const openai = new OpenAI({ 
    apiKey, 
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Creative Insights",
    }
  });

  let messageContent: any[] = [{ type: "text", text: prompt }];

  if (images && images.length > 0) {
    const imageParts = images.map((img) => ({
      type: "image_url",
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    }));
    messageContent = [...messageContent, ...imageParts];
  }

  const response = await openai.chat.completions.create({
    model: modelId,
    messages: [{ role: "user", content: messageContent }],
  });

  return response.choices[0]?.message?.content?.trim() || null;
}

async function tryCohere(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("COHERE_API_KEY not found. Skipping Cohere.");
    return null;
  }

  if (images && images.length > 0) {
    console.warn("Cohere doesn't support images in this fallback. Falling back to text-only mode.");
  }

  const modelId = await getCachedModel("cohere", () => getBestCohereModel(apiKey), "command-r-plus");
  const response = await fetch("https://api.cohere.com/v1/chat", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      message: prompt,
    })
  });

  if (!response.ok) {
    throw new Error(`Cohere API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.text?.trim() || null;
}

async function tryHuggingFace(prompt: string, apiKey: string, images?: AiImageInput[]): Promise<string | null> {
  if (!apiKey) {
    console.warn("HUGGINGFACE_API_KEY not found. Skipping Hugging Face.");
    return null;
  }

  if (images && images.length > 0) {
    console.warn("HuggingFace fallback doesn't support images currently. Falling back to text-only mode.");
  }

  const modelId = await getCachedModel("huggingface", () => getBestHuggingFaceModel(), "meta-llama/Meta-Llama-3-8B-Instruct");
  const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    })
  });

  // If the chat completions API fails on this model (not all HF models support it), fallback to normal inference API
  if (!response.ok) {
    console.warn(`Hugging Face chat completion failed, trying standard generation for ${modelId}`);
    const stdResponse = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: 1024 }
      })
    });
    
    if (!stdResponse.ok) {
        throw new Error(`Hugging Face API error: ${stdResponse.statusText}`);
    }
    const data = await stdResponse.json();
    return Array.isArray(data) ? data[0]?.generated_text?.trim() : data?.generated_text?.trim() || null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}
