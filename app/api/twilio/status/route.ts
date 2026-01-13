import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const callSid = String(form.get("CallSid") ?? "");
    const callStatus = String(form.get("CallStatus") ?? "");
    const from = String(form.get("From") ?? "");
    const to = String(form.get("To") ?? "");
    const eventType = callStatus || "status";
    const durationRaw = form.get("CallDuration");
    const duration =
      durationRaw !== null && durationRaw !== undefined ? Number(durationRaw) : null;

    if (!callSid) return NextResponse.json({ ok: true });

    const db: any = prisma;

    const conversation = await db.conversation.findUnique({
      where: { externalId: callSid },
      select: { id: true },
    });

    await db.twilioEvent.create({
      data: {
        callSid,
        eventType,
        callStatus: callStatus || null,
        from: from || null,
        to: to || null,
        duration: Number.isFinite(duration as any) ? duration : null,
        conversationId: conversation?.id ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 200 });
  }
}

// utile si Twilio teste en GET
export async function GET() {
  return NextResponse.json({ ok: true });
}
