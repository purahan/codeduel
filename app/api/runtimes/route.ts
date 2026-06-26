import { NextResponse } from "next/server";
import { getRuntimes } from "@/lib/piston";

/**
 * GET /api/runtimes
 *
 * Returns the list of available code execution runtimes from the Piston server.
 * Results are cached in-memory for 5 minutes by the piston service layer.
 *
 * The frontend should call this endpoint instead of contacting the Piston
 * server directly — all code execution infrastructure is proxied through
 * the backend.
 */
export async function GET() {
  try {
    const runtimes = await getRuntimes();
    return NextResponse.json(runtimes);
  } catch (err: any) {
    console.error("[API /runtimes] Failed to fetch runtimes:", err.message);
    return NextResponse.json(
      { error: "Code execution service is temporarily unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
