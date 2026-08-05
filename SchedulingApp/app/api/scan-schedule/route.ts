import { NextRequest, NextResponse } from "next/server";
import { ScheduleScanResult, ScannedClassBlock } from "@/lib/schedule-import";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const scheduleSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "integer", minimum: 0, maximum: 4 },
          start: { type: "number", minimum: 0, maximum: 24 },
          end: { type: "number", minimum: 0, maximum: 24 },
          label: { type: "string", minLength: 1, maxLength: 80 },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["day", "start", "end", "label", "confidence"],
      },
    },
    warnings: { type: "array", items: { type: "string", maxLength: 240 } },
  },
  required: ["blocks", "warnings"],
} as const;

async function isAuthorized(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !supabaseKey || !authorization?.startsWith("Bearer ")) return false;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: authorization },
    cache: "no-store",
  });
  return response.ok;
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (response.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
}

function sanitizeResult(value: ScheduleScanResult): ScheduleScanResult {
  const seen = new Set<string>();
  const blocks = (value.blocks ?? []).flatMap((block): ScannedClassBlock[] => {
    const start = Math.round(Number(block.start) * 4) / 4;
    const end = Math.round(Number(block.end) * 4) / 4;
    const day = Number(block.day);
    if (!Number.isInteger(day) || day < 0 || day > 4 || start < 0 || end > 24 || end <= start) return [];
    const label = String(block.label || "Class").trim().slice(0, 80) || "Class";
    const key = `${day}-${start}-${end}-${label.toLowerCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      day: day as ScannedClassBlock["day"], start, end, label,
      confidence: ["high", "medium", "low"].includes(block.confidence) ? block.confidence : "low",
    }];
  });
  return {
    blocks: blocks.sort((a, b) => a.day - b.day || a.start - b.start),
    warnings: (value.warnings ?? []).map(String).filter(Boolean).slice(0, 10),
  };
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Please sign in again before scanning a schedule." }, { status: 401 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured on the server." }, { status: 503 });

  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "Choose a schedule image to scan." }, { status: 400 });
  if (!ALLOWED_IMAGE_TYPES.has(image.type)) return NextResponse.json({ error: "Use a PNG, JPG, or WebP image." }, { status: 415 });
  if (image.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "The image must be 10 MB or smaller." }, { status: 413 });

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_SCHEDULE_SCAN_MODEL || "gpt-5.6-luna",
      store: false,
      reasoning: { effort: "low" },
      input: [{ role: "user", content: [
        { type: "input_text", text: [
          "Extract every recurring Monday-Friday class meeting visible in this student schedule.",
          "The image may be a course table or a weekly calendar.",
          "Use day numbers 0=Monday through 4=Friday and decimal 24-hour times (9:30 AM=9.5, 5:15 PM=17.25).",
          "Create one block for every day a meeting repeats. Ignore weekends, credits, registration metadata, exams, and work shifts.",
          "Use the course code or shortest recognizable course name as label.",
          "Mark confidence low and add a warning whenever text, AM/PM, meeting days, or calendar geometry is uncertain.",
          "Do not guess meetings that are not visible. Return an empty blocks array if no schedule can be read.",
        ].join(" ") },
        { type: "input_image", image_url: `data:${image.type};base64,${base64}`, detail: "high" },
      ] }],
      text: { format: { type: "json_schema", name: "student_schedule", strict: true, schema: scheduleSchema } },
    }),
  });

  const payload: unknown = await openAIResponse.json();
  if (!openAIResponse.ok) {
    const message = payload && typeof payload === "object" && "error" in payload
      ? String((payload as { error?: { message?: string } }).error?.message || "OpenAI could not scan the image.")
      : "OpenAI could not scan the image.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  try {
    return NextResponse.json(sanitizeResult(JSON.parse(responseText(payload)) as ScheduleScanResult));
  } catch {
    return NextResponse.json({ error: "The scan finished, but its class blocks could not be read. Please try again." }, { status: 502 });
  }
}
