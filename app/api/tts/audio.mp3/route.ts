import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return null;
  const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!m) return null;

  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;

  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end)) end = size - 1;

  if (start < 0) start = 0;
  if (end >= size) end = size - 1;
  if (start > end) return null;

  return { start, end };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const text = (searchParams.get("text") ?? "").trim();

  if (!text) return new Response("Missing text", { status: 400 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return new Response("Missing ELEVENLABS env vars", { status: 500 });
  }

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
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
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    return new Response(`ElevenLabs error: ${r.status}\n${err}`, { status: 500 });
  }

  const audio = Buffer.from(await r.arrayBuffer());
  const size = audio.length;

  const range = parseRange(req.headers.get("range"), size);

  // Twilio envoie souvent Range: bytes=0-
  if (range) {
    const { start, end } = range;
    const chunk = audio.subarray(start, end + 1);

    return new Response(chunk, {
      status: 206,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="tts.mp3"',
      },
    });
  }

  return new Response(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="tts.mp3"',
    },
  });
}
