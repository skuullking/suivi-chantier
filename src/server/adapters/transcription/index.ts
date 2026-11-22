/**
 * Speech to text. `mock`: returns the text registered by the simulator for this audio (by SHA-256) or a default
 * sentence. `whisper`: any OpenAI-compatible transcription endpoint (OpenAI, whisper.cpp server, faster-whisper…).
 */
import { storage } from "@/server/adapters/storage";
import { sha256Hex } from "@/server/auth/tokens";
import { env } from "@/server/env";

export type TranscriptionInput = { bytes: Uint8Array; mimeType: string; fileName: string };

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<{ text: string }>;
}

export function simulatorTranscriptKey(bytes: Uint8Array) {
  return `dev/transcripts/${sha256Hex(Buffer.from(bytes))}.txt`;
}

export const DEFAULT_MOCK_TRANSCRIPT =
  "On a terminé la pose des fermes ce matin, cet après-midi on attaque le contreventement. Tout se passe bien.";

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";
  async transcribe(input: TranscriptionInput) {
    const registered = await storage()
      .get(simulatorTranscriptKey(input.bytes))
      .then((b) => b.toString("utf8").trim())
      .catch(() => null);
    return { text: registered || DEFAULT_MOCK_TRANSCRIPT };
  }
}

export class WhisperTranscriptionProvider implements TranscriptionProvider {
  readonly name = "whisper";
  constructor(
    private readonly url: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
  ) {}

  async transcribe(input: TranscriptionInput) {
    const form = new FormData();
    form.set("file", new Blob([Buffer.from(input.bytes)], { type: input.mimeType }), input.fileName);
    form.set("model", this.model);
    form.set("language", "fr");
    form.set("response_format", "json");
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription refusée (${res.status})`);
    const body = (await res.json()) as { text?: string };
    return { text: (body.text ?? "").trim() };
  }
}

let provider: TranscriptionProvider | null = null;

export function transcription(): TranscriptionProvider {
  if (provider) return provider;
  const e = env();
  provider =
    e.TRANSCRIPTION_PROVIDER === "whisper"
      ? new WhisperTranscriptionProvider(e.WHISPER_API_URL, e.WHISPER_API_KEY, e.WHISPER_MODEL)
      : new MockTranscriptionProvider();
  return provider;
}

export function setTranscriptionProvider(p: TranscriptionProvider | null) {
  provider = p;
}
