import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") ?? "").trim();

  if (!text) {
    return new Response("Missing text", { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return new Response("Missing ELEVENLABS env vars", { status: 500 });
  }

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
          style: 0.35,
          speaker_boost: true,
        },
      }),
    }
  );

  if (!elevenRes.ok) {
    const err = await elevenRes.text().catch(() => "");
    return new Response(
      `ElevenLabs error: ${elevenRes.status}\n${err}`,
      { status: 500 }
    );
  }

  const audioBuffer = Buffer.from(await elevenRes.arrayBuffer());

  return new Response(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length.toString(),
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    },
  });
}
