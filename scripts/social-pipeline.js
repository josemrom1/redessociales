#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = process.cwd();
const CONFIG_DIR = path.join(REPO_ROOT, "config");
const DEFAULT_LIMITS_PATH = path.join(CONFIG_DIR, "platform-limits.json");
const DEFAULT_PROMPTS_PATH = path.join(CONFIG_DIR, "prompts.json");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");

function parseArgs(argv) {
  const args = {
    dryRun: false,
    platform: "buffer",
    promptKey: "daily-default",
    topic: "",
    maxLengthOverride: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--dry-run") args.dryRun = true;
    else if (value === "--platform" && argv[i + 1]) args.platform = argv[i + 1];
    else if (value === "--prompt-key" && argv[i + 1]) args.promptKey = argv[i + 1];
    else if (value === "--topic" && argv[i + 1]) args.topic = argv[i + 1];
    else if (value === "--max-length" && argv[i + 1]) args.maxLengthOverride = Number(argv[i + 1]);
  }

  if (process.env.DRY_RUN === "true") args.dryRun = true;
  if (process.env.PLATFORM) args.platform = process.env.PLATFORM;
  if (process.env.PROMPT_KEY) args.promptKey = process.env.PROMPT_KEY;
  if (process.env.TOPIC) args.topic = process.env.TOPIC;
  if (process.env.MAX_LENGTH) args.maxLengthOverride = Number(process.env.MAX_LENGTH);
  return args;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read JSON file at ${filePath}: ${error.message}`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function logStructured(level, message, meta = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else console.log(line);
}

function buildPrompt(promptTemplate, topic, maxLength) {
  return promptTemplate
    .replaceAll("{{topic}}", topic || "social media productivity tip")
    .replaceAll("{{maxLength}}", String(maxLength));
}

async function callGemini({ apiKey, model, prompt }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text?.trim();
  if (!text) throw new Error("Gemini API response did not contain generated text.");
  return text;
}

async function publishViaBuffer({ text, dryRun }) {
  const accessToken = requiredEnv("BUFFER_ACCESS_TOKEN");
  const profileId = requiredEnv("BUFFER_PROFILE_ID");
  if (dryRun) {
    return { status: "dry-run", provider: "buffer", textLength: text.length };
  }

  const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      profile_ids: [profileId],
      text,
      now: false,
      shorten: true,
    }),
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Buffer publish failed (${response.status}): ${bodyText}`);
  }
  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    payload = { raw: bodyText };
  }
  return { status: "published", provider: "buffer", payload };
}

function getPublisherAdapter(platform) {
  if (platform === "buffer") return publishViaBuffer;
  throw new Error(`Unsupported platform adapter: ${platform}. Supported: buffer`);
}

function enforceLimit(text, maxLength) {
  if (text.length > maxLength) return text.slice(0, maxLength - 1).trimEnd() + "…";
  return text;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureOutputDir();
  const limits = readJson(DEFAULT_LIMITS_PATH);
  const prompts = readJson(DEFAULT_PROMPTS_PATH);
  const promptCfg = prompts[args.promptKey];
  if (!promptCfg) {
    throw new Error(`Prompt key "${args.promptKey}" not found in ${DEFAULT_PROMPTS_PATH}`);
  }
  const platformCfg = limits[args.platform];
  if (!platformCfg) {
    throw new Error(`Platform "${args.platform}" not configured in ${DEFAULT_LIMITS_PATH}`);
  }
  const maxLength = Number.isFinite(args.maxLengthOverride) && args.maxLengthOverride > 0
    ? args.maxLengthOverride
    : platformCfg.maxLength;
  if (!Number.isFinite(maxLength) || maxLength <= 0) throw new Error("Resolved maxLength must be a positive number.");

  const apiKey = requiredEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const prompt = buildPrompt(promptCfg.template, args.topic, maxLength);

  logStructured("info", "Generating social post with Gemini.", {
    platform: args.platform,
    dryRun: args.dryRun,
    promptKey: args.promptKey,
    model,
    maxLength,
  });

  const rawText = await callGemini({ apiKey, model, prompt });
  const finalText = enforceLimit(rawText, maxLength);
  if (!finalText) throw new Error("Generated text was empty after limit enforcement.");

  const publisher = getPublisherAdapter(args.platform);
  const publishResult = await publisher({ text: finalText, dryRun: args.dryRun });

  const artifact = {
    generatedAt: new Date().toISOString(),
    args,
    model,
    post: finalText,
    publishResult,
  };
  const outFile = path.join(OUTPUT_DIR, `social-post-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));

  logStructured("info", "Social posting pipeline completed.", {
    outputFile: path.relative(REPO_ROOT, outFile),
    publishStatus: publishResult.status,
  });
}

main().catch((error) => {
  logStructured("error", "Social posting pipeline failed.", { error: error.message, stack: error.stack });
  process.exit(1);
});
