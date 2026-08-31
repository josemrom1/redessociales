/**
 * wellness-agent extension
 *
 * Tools:
 *   wellness_list_quotes  — browse the bilingual EN/ES message bank
 *   wellness_generate     — generate paired 9:16 quote images via Ideogram API
 *                          (or dry_run:true to preview prompts with no API call)
 *   wellness_review       — show approval checklist for images in output/pending/
 *
 * No Python required — all logic runs in Node.js inside this extension.
 */
import { joinSession } from "@github/copilot-sdk/extension";
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Paths ──────────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, "..", "..", "..");
const BANK_PATH  = join(REPO_ROOT, "messages", "wellness_bank.json");
const PROMPTS_PATH = join(REPO_ROOT, "prompts", "image_prompts.yaml");
const PENDING    = join(REPO_ROOT, "output", "pending");
const APPROVED   = join(REPO_ROOT, "output", "approved");
const CHECKLIST  = join(REPO_ROOT, "docs", "approval_rules.md");

// ── Helpers ────────────────────────────────────────────────────────────────
function loadBank() {
    return JSON.parse(readFileSync(BANK_PATH, "utf8"));
}

/** Minimal YAML parser — only needs key: "value" and nested blocks */
function parseYaml(text) {
    const result = {};
    let currentTopKey = null;
    let currentBlock = null;
    for (const rawLine of text.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (!line.trim() || line.trim().startsWith("#")) continue;
        const indent = line.match(/^(\s*)/)[1].length;
        const content = line.trim();

        // top-level key
        if (indent === 0 && content.endsWith(":")) {
            currentTopKey = content.slice(0, -1);
            result[currentTopKey] = {};
            currentBlock = null;
            continue;
        }
        // second-level key (nested object)
        if (indent === 2 && content.endsWith(":")) {
            currentBlock = content.slice(0, -1);
            if (currentTopKey) result[currentTopKey][currentBlock] = {};
            continue;
        }
        // key: "value"
        const kv = content.match(/^([\w_]+):\s+"?(.*?)"?\s*$/);
        if (kv) {
            const [, k, v] = kv;
            if (currentTopKey && currentBlock) {
                result[currentTopKey][currentBlock][k] = v;
            } else if (currentTopKey) {
                result[currentTopKey][k] = v;
            }
            continue;
        }
        // key: > (block scalar — collect remainder as string)
        const blockScalar = content.match(/^([\w_]+):\s*>$/);
        if (blockScalar && currentTopKey) {
            // Not needed for our palettes/scenes lookups; skip
        }
    }
    return result;
}

const PALETTES = {
    mindfulness:   "soft lavender and sage green",
    nutrition:     "warm terracotta and cream",
    movement:      "electric blue and deep navy",
    sleep:         "deep indigo and midnight blue",
    mental_health: "gentle rose and warm ivory",
};
const NATURE_SCENES = {
    mindfulness:   "misty mountain forest at dawn",
    nutrition:     "sunlit farmers market produce, close-up",
    movement:      "open trail through green hills at sunrise",
    sleep:         "starry night sky over a calm lake",
    mental_health: "gentle ocean waves on a quiet beach",
};
const CATEGORY_TEMPLATE_DEFAULT = {
    mindfulness:   "a",
    nutrition:     "c",
    movement:      "b",
    sleep:         "c",
    mental_health: "a",
};

const TEMPLATES = {
    a_en: (cat, en) =>
        `Vertical 9:16 social-media wellness quote card, minimalist design, ` +
        `soft gradient background in ${PALETTES[cat] || "soft blue and white"} tones, generous white space, ` +
        `large elegant sans-serif typography centered on canvas, ` +
        `English quote in white or dark ink: "${en}", ` +
        `small brand handle @wellness at bottom center, ` +
        `no people, no clutter, calming and premium feel, photorealistic digital art, ultra high resolution`,

    a_es: (cat, es) =>
        `Tarjeta vertical 9:16 para redes sociales, diseño minimalista bilingüe, ` +
        `fondo con degradado suave en tonos ${PALETTES[cat] || "azul suave y blanco"}, espacio en blanco generoso, ` +
        `tipografía sans-serif grande y elegante centrada en el lienzo, ` +
        `cita en español en tinta blanca o oscura: "${es}", ` +
        `pequeño handle de marca @wellness en la parte inferior, sin personas, limpio y premium, ` +
        `arte digital fotorealista, ultra alta resolución`,

    b_en: (cat, en) =>
        `Vertical 9:16 Instagram Story wellness quote card, bold modern design, ` +
        `solid ${PALETTES[cat] || "deep blue"} background with a geometric accent shape (circle or arc) ` +
        `in a contrasting warm tone, large bold sans-serif English quote in white: "${en}", ` +
        `thin decorative line above and below text, category label "${cat.replace("_"," ")}" in small caps at the top, ` +
        `@wellness handle at bottom, energetic and motivational, digital graphic design, 4K`,

    b_es: (cat, es) =>
        `Tarjeta vertical 9:16 para Instagram Story, diseño moderno y atrevido, ` +
        `fondo sólido ${PALETTES[cat] || "azul profundo"} con forma geométrica de acento en tono cálido contrastante, ` +
        `cita en español en negrita sans-serif en blanco: "${es}", ` +
        `línea decorativa fina sobre y bajo el texto, etiqueta "${cat.replace("_"," ")}" en versalitas arriba, ` +
        `@wellness al pie, energético y motivacional, diseño gráfico digital, 4K`,

    c_en: (cat, en) =>
        `Vertical 9:16 wellness quote card with a soft blurred nature photography background ` +
        `(${NATURE_SCENES[cat] || "serene natural landscape"}), dark semi-transparent overlay for legibility, ` +
        `elegant serif or handwritten English quote centered: "${en}", ` +
        `subtle botanical illustration elements (leaves, botanicals) in corners, ` +
        `@wellness branding at bottom, warm and grounded aesthetic, high-end magazine feel, ultra-sharp, 4K`,

    c_es: (cat, es) =>
        `Tarjeta vertical 9:16 con fondo fotográfico suave de naturaleza ` +
        `(${NATURE_SCENES[cat] || "paisaje natural sereno"}), capa oscura semi-transparente para legibilidad, ` +
        `cita en español en tipografía serif o manuscrita centrada: "${es}", ` +
        `elementos botánicos ilustrados sutiles en las esquinas, branding @wellness al pie, ` +
        `estética cálida y arraigada, estilo de revista premium, ultra nítido, 4K`,
};

const NEGATIVE_PROMPT =
    "text errors, misspelled words, blurry text, low resolution, watermark, " +
    "stock photo watermark, people's faces, cluttered layout, neon colors, " +
    "cartoon style, childish, violent, political content";

function pickQuote(bank, category, quoteId) {
    const cats = bank.categories;
    if (quoteId) {
        for (const [cat, quotes] of Object.entries(cats)) {
            const q = quotes.find(x => x.id === quoteId);
            if (q) return { cat, en: q.en, es: q.es };
        }
        return { error: `Quote ID '${quoteId}' not found.` };
    }
    if (category) {
        if (!cats[category]) return { error: `Category '${category}' not found. Available: ${Object.keys(cats).join(", ")}` };
        const q = cats[category][Math.floor(Math.random() * cats[category].length)];
        return { cat: category, en: q.en, es: q.es };
    }
    const all = Object.entries(cats).flatMap(([cat, qs]) => qs.map(q => ({ cat, ...q })));
    const q = all[Math.floor(Math.random() * all.length)];
    return { cat: q.cat, en: q.en, es: q.es };
}

function allQuotes(bank) {
    return Object.entries(bank.categories).flatMap(([cat, qs]) =>
        qs.map(q => ({ cat, en: q.en, es: q.es }))
    );
}

async function callIdeogram(apiKey, prompt, dryRun) {
    if (dryRun) return { dryRun: true, prompt };
    const body = JSON.stringify({
        image_request: {
            prompt,
            negative_prompt: NEGATIVE_PROMPT,
            aspect_ratio: "ASPECT_9_16",
            model: "V_2",
            style_type: "DESIGN",
            magic_prompt_option: "OFF",
        }
    });
    const resp = await fetch("https://api.ideogram.ai/generate", {
        method: "POST",
        headers: { "Api-Key": apiKey, "Content-Type": "application/json" },
        body,
    });
    if (!resp.ok) {
        const text = await resp.text();
        return { error: `Ideogram API ${resp.status}: ${text.slice(0, 300)}` };
    }
    const data = await resp.json();
    return { url: data?.data?.[0]?.url };
}

async function downloadImage(url, dest) {
    const resp = await fetch(url);
    if (!resp.ok) return { error: `Download failed: ${resp.status}` };
    const buf = Buffer.from(await resp.arrayBuffer());
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    return { saved: dest };
}

function ts() {
    return new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
}

async function processQuote({ cat, en, es }, templateId, apiKey, dryRun, lines) {
    const t = templateId || CATEGORY_TEMPLATE_DEFAULT[cat] || "a";
    for (const [lang, quote] of [["en", en], ["es", es]]) {
        const tplKey = `${t}_${lang}`;
        const tplFn = TEMPLATES[tplKey];
        if (!tplFn) { lines.push(`  [SKIP] Unknown template ${tplKey}`); continue; }
        const prompt = tplFn(cat, quote);
        lines.push(`\n▶ [${lang.toUpperCase()}] ${cat} — "${quote.slice(0, 50)}${quote.length > 50 ? '…' : ''}"`);
        if (dryRun) {
            lines.push(`  [DRY RUN] Prompt:\n  ${prompt.slice(0, 200)}…`);
            continue;
        }
        const result = await callIdeogram(apiKey, prompt, false);
        if (result.error) { lines.push(`  [ERROR] ${result.error}`); continue; }
        const slug = quote.slice(0, 25).toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
        const fname = `${ts()}_${cat}_${lang}_${slug}.png`;
        const dest = join(PENDING, fname);
        const dl = await downloadImage(result.url, dest);
        lines.push(dl.error ? `  [ERROR] ${dl.error}` : `  Saved → output/pending/${fname}`);
    }
}

// ── Extension ──────────────────────────────────────────────────────────────
const session = await joinSession({
    tools: [
        // ── 1. LIST QUOTES ───────────────────────────────────────────────
        {
            name: "wellness_list_quotes",
            description:
                "List bilingual wellness quotes from the message bank. " +
                "Optionally filter by category. Returns id, EN quote, ES quote, and hashtags.",
            skipPermission: true,
            parameters: {
                type: "object",
                properties: {
                    category: {
                        type: "string",
                        description:
                            "Optional category filter. One of: mindfulness, nutrition, movement, sleep, mental_health.",
                    },
                },
            },
            handler: async (args) => {
                const bank = loadBank();
                const cats = bank.categories;
                const filter = args.category;
                if (filter && !cats[filter]) {
                    return {
                        textResultForLlm: `Category '${filter}' not found. Available: ${Object.keys(cats).join(", ")}`,
                        resultType: "failure",
                    };
                }
                const entries = filter ? [[filter, cats[filter]]] : Object.entries(cats);
                const lines = [];
                for (const [cat, quotes] of entries) {
                    lines.push(`\n### ${cat.toUpperCase()}`);
                    for (const q of quotes) {
                        lines.push(`  [${q.id}]  EN: "${q.en}"`);
                        lines.push(`         ES: "${q.es}"`);
                        lines.push(`         Tags EN: ${q.hashtags_en.join(" ")}`);
                        lines.push(`         Tags ES: ${q.hashtags_es.join(" ")}`);
                    }
                }
                return lines.join("\n");
            },
        },

        // ── 2. GENERATE IMAGES ───────────────────────────────────────────
        {
            name: "wellness_generate",
            description:
                "Generate paired English and Spanish 9:16 wellness quote images using the Ideogram API. " +
                "Requires IDEOGRAM_API_KEY env var, or pass dry_run:true to preview prompts without calling the API. " +
                "Images are saved to output/pending/ for human review before publishing.",
            parameters: {
                type: "object",
                properties: {
                    category: {
                        type: "string",
                        description: "Category to pick a random quote from (mindfulness, nutrition, movement, sleep, mental_health). Omit for random.",
                    },
                    quote_id: {
                        type: "string",
                        description: "Specific quote ID (e.g. mf-01). Overrides category.",
                    },
                    template: {
                        type: "string",
                        enum: ["a", "b", "c"],
                        description: "Image template: a=minimalist, b=bold-accent, c=nature. Omit to use category default.",
                    },
                    all_quotes: {
                        type: "boolean",
                        description: "If true, generate images for ALL quotes in the bank.",
                    },
                    dry_run: {
                        type: "boolean",
                        description: "If true, print prompts without calling the API. Safe without an API key.",
                    },
                },
            },
            handler: async (args) => {
                const apiKey = process.env.IDEOGRAM_API_KEY || "";
                if (!apiKey && !args.dry_run) {
                    return {
                        textResultForLlm:
                            "IDEOGRAM_API_KEY is not set. " +
                            "Set it with: $env:IDEOGRAM_API_KEY='your_key' (PowerShell) or use dry_run:true to preview prompts.",
                        resultType: "failure",
                    };
                }

                await session.log(args.dry_run ? "Previewing wellness image prompts…" : "Generating wellness images via Ideogram…", { ephemeral: true });

                const bank = loadBank();
                const lines = [];
                mkdirSync(PENDING, { recursive: true });

                if (args.all_quotes) {
                    for (const q of allQuotes(bank)) {
                        await processQuote(q, args.template, apiKey, !!args.dry_run, lines);
                    }
                } else {
                    const q = pickQuote(bank, args.category, args.quote_id);
                    if (q.error) return { textResultForLlm: q.error, resultType: "failure" };
                    await processQuote(q, args.template, apiKey, !!args.dry_run, lines);
                }

                const pending = existsSync(PENDING) ? readdirSync(PENDING).filter(f => f.endsWith(".png")) : [];
                const summary = (!args.dry_run && pending.length)
                    ? `\n\nImages in output/pending/ (${pending.length} total):\n` + pending.map(f => `  • ${f}`).join("\n")
                    : "";

                const footer = args.dry_run
                    ? "\n\n✅ Dry run complete. Set IDEOGRAM_API_KEY and run without --dry-run to generate real images."
                    : "\n\n✅ Done. Call wellness_review for the approval checklist before publishing.";

                return lines.join("\n") + summary + footer;
            },
        },

        // ── 3. REVIEW / APPROVAL CHECKLIST ──────────────────────────────
        {
            name: "wellness_review",
            description:
                "Print the approval checklist for wellness images in output/pending/. " +
                "Walk through this before publishing.",
            skipPermission: true,
            parameters: { type: "object", properties: {} },
            handler: async () => {
                const pending = existsSync(PENDING) ? readdirSync(PENDING).filter(f => f.endsWith(".png")) : [];
                const header = pending.length
                    ? `## Pending images (${pending.length})\n` + pending.map(f => `- ${f}`).join("\n") + "\n\n---\n\n"
                    : "## No images currently in output/pending/\n\n---\n\n";
                return header + readFileSync(CHECKLIST, "utf8");
            },
        },
    ],

    hooks: {
        onSessionStart: async () => ({
            additionalContext:
                "The wellness-agent extension is active. Three tools are available:\n" +
                "  • wellness_list_quotes  — browse bilingual EN/ES wellness message bank\n" +
                "  • wellness_generate     — generate paired 9:16 quote images (dry_run:true to test without API key)\n" +
                "  • wellness_review       — approval checklist for images in output/pending/\n" +
                "To generate real images, set: $env:IDEOGRAM_API_KEY='your_key_here' (PowerShell).",
        }),
    },
});
