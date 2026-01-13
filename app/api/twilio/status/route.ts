import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const form = await req.formData();

  const callSid = String(form.get("CallSid") ?? "");
  const callStatus = String(form.get("CallStatus") ?? "");
  const eventType = String(form.get("StatusCallbackEvent") ?? callStatus ?? "unknown");

  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");

  const durationRaw = String(form.get("CallDuration") ?? "");
  const duration = durationRaw ? Number(durationRaw) : null;

  if (!callSid) return NextResponse.json({ ok: true });

  const conversation = await prisma.conversation.findUnique({
    where: { externalId: callSid },
    select: { id: true },
  });

  await prisma.twilioEvent.create({
    data: {
      callSid,
      eventType,
      callStatus: callStatus || null,
      from: from || null,
      to: to || null,
      duration: Number.isFinite(duration as number) ? (duration as number) : null,
      conversationId: conversation?.id ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
