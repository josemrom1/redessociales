/**
 * wellness-agent extension
 * Tools:
 *   - wellness_list_quotes   — browse the bilingual message bank
 *   - wellness_generate      — generate EN+ES 9:16 images via Ideogram (or dry-run)
 *   - wellness_review        — show approval checklist for pending images
 */
import { joinSession } from "@github/copilot-sdk/extension";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const BANK_PATH = join(REPO_ROOT, "messages", "wellness_bank.json");
const AGENT_PY  = join(REPO_ROOT, "agent", "wellness_agent.py");
const PENDING   = join(REPO_ROOT, "output", "pending");

function loadBank() {
    return JSON.parse(readFileSync(BANK_PATH, "utf8"));
}

const session = await joinSession({
    tools: [
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
                await session.log("Generating wellness images...", { ephemeral: true });
                const pyArgs = [];
                if (args.category)   pyArgs.push("--category", args.category);
                if (args.quote_id)   pyArgs.push("--quote-id", args.quote_id);
                if (args.template)   pyArgs.push("--template", args.template);
                if (args.all_quotes) pyArgs.push("--all");
                if (args.dry_run)    pyArgs.push("--dry-run");

                const result = spawnSync("python", [AGENT_PY, ...pyArgs], {
                    encoding: "utf8",
                    timeout: 120000,
                    env: { ...process.env },
                });
                const output = ((result.stdout || "") + (result.stderr || "")).trim();
                if (result.status !== 0 && !args.dry_run) {
                    return { textResultForLlm: `Agent failed (exit ${result.status}):\n${output}`, resultType: "failure" };
                }
                const pending = existsSync(PENDING) ? readdirSync(PENDING).filter(f => f.endsWith(".png")) : [];
                const summary = pending.length
                    ? `\n\nImages in output/pending/ (${pending.length}):\n` + pending.map(f => `  * ${f}`).join("\n")
                    : "";
                return output + summary + "\n\nCall wellness_review for the approval checklist.";
            },
        },
        {
            name: "wellness_review",
            description:
                "Print the approval checklist for images in output/pending/. " +
                "Walk through this before publishing.",
            skipPermission: true,
            parameters: { type: "object", properties: {} },
            handler: async () => {
                const checklistPath = join(REPO_ROOT, "docs", "approval_rules.md");
                const pending = existsSync(PENDING) ? readdirSync(PENDING).filter(f => f.endsWith(".png")) : [];
                const header = pending.length
                    ? `## Pending images (${pending.length})\n` + pending.map(f => `- ${f}`).join("\n") + "\n\n---\n\n"
                    : "## No images currently in output/pending/\n\n---\n\n";
                return header + readFileSync(checklistPath, "utf8");
            },
        },
    ],
    hooks: {
        onSessionStart: async () => ({
            additionalContext:
                "wellness-agent extension is active with 3 tools:\n" +
                "  wellness_list_quotes — browse EN/ES message bank\n" +
                "  wellness_generate    — generate 9:16 quote images (dry_run:true to test)\n" +
                "  wellness_review      — approval checklist for output/pending/ images\n" +
                "Set IDEOGRAM_API_KEY env var to generate real images.",
        }),
    },
});
