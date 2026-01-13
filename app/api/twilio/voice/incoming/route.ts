import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/twilio/voice/incoming" });
}
export async function POST() {
  return NextResponse.json({ ok: true, route: "/api/twilio/voice/incoming" });
}
