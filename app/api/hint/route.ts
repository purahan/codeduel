import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "@/lib/dynamo";

const MAX_HINTS = 3;

// Tier-specific prompts sent as the user message — each one explicitly names
// the tier so Gemini can't conflate them. Temperature is raised to 0.7 so
// successive hints feel meaningfully different.
const TIER_INSTRUCTIONS = [
  // Tier 1 — conceptual, no code
  `Give a TIER 1 hint: a single conceptual nudge pointing the player toward the right algorithm category or data structure. 
   Be very brief (1-2 sentences). Do NOT mention any specifics of the implementation. No code.`,

  // Tier 2 — approach
  `Give a TIER 2 hint: describe the high-level approach in plain language. 
   Explain *what* to do at a step-by-step level without writing any code. 2-3 sentences.`,

  // Tier 3 — concrete pseudocode nudge
  `Give a TIER 3 hint: provide a concise pseudocode sketch or a concrete implementation insight that shows the key idea. 
   Still do NOT write complete working code, but be specific enough that the player can implement it themselves.`,
];

const SYSTEM_PROMPT = `You are a Socratic coding coach in a competitive programming duel.
Help the player get unstuck without giving away the full solution.
NEVER write complete working code.
Be concise, warm, and encouraging.
Respond with plain text only — no markdown headers, no bullet points.`;

// Per-tier fallbacks used only when the Gemini API is unavailable
const FALLBACK_HINTS = [
  "Think about what data structure would let you look up information in constant time.",
  "Consider iterating through the input and building up a result incrementally — what state do you need to track at each step?",
  "Try writing a helper function: define its inputs and outputs first, then implement. For this problem, think about what the recursive or iterative sub-step looks like.",
];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const { matchId, problemTitle, problemDescription, currentCode, language } =
    await req.json();

  if (!matchId || !problemTitle) {
    return NextResponse.json(
      { error: "matchId and problemTitle are required" },
      { status: 400 }
    );
  }

  // Fetch match to verify auth + get current hint count
  const matchResult = await dynamo.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `MATCH#${matchId}`, SK: "META" },
    })
  );

  const match = matchResult.Item;
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const isPlayer1 = match.player1.userId === userId;
  const isPlayer2 = match.player2.userId === userId;
  if (!isPlayer1 && !isPlayer2) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (match.status !== "active") {
    return NextResponse.json({ error: "Match is not active" }, { status: 409 });
  }

  const myRole    = isPlayer1 ? "player1" : "player2";
  const hintsUsed = (match[myRole].hintsUsed ?? 0) as number;

  if (hintsUsed >= MAX_HINTS) {
    return NextResponse.json(
      { error: "No hints remaining", hintsUsed },
      { status: 429 }
    );
  }

  const tierIndex   = hintsUsed;           // 0, 1, or 2
  const tierNumber  = hintsUsed + 1;       // 1, 2, or 3

  const userMessage = `Problem: ${problemTitle}

Description: ${problemDescription}

Player's current ${language} code:
\`\`\`${language}
${currentCode?.trim() || "(empty — player hasn't written anything yet)"}
\`\`\`

${TIER_INSTRUCTIONS[tierIndex]}`;

  let hint = FALLBACK_HINTS[tierIndex]; // default if Gemini fails

  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
      console.error("[hint] GEMINI_API_KEY is not set — using fallback hint");
    } else {
      const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.7,   // higher = more varied hints across tiers
          },
        }),
      });

      const data = await response.json();

      // Log the raw response so we can debug API key / quota issues
      if (!response.ok || data.error) {
        console.error("[hint] Gemini API error:", JSON.stringify(data));
      } else {
        const generated = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (generated?.trim()) {
          hint = generated.trim();
        } else {
          console.warn("[hint] Gemini returned empty candidates — using fallback. Response:", JSON.stringify(data));
        }
      }
    }
  } catch (err) {
    console.error("[hint] Network/parse error calling Gemini:", err);
  }

  // Always increment hintsUsed so the tier advances even on API failure
  const newHintsUsed = hintsUsed + 1;
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `MATCH#${matchId}`, SK: "META" },
      UpdateExpression: `SET ${myRole}.hintsUsed = :h`,
      ExpressionAttributeValues: { ":h": newHintsUsed },
    })
  );

  return NextResponse.json({
    hint,
    hintsUsed:      newHintsUsed,
    hintsRemaining: MAX_HINTS - newHintsUsed,
    tier:           tierNumber,
  });
}
