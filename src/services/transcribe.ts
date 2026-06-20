// src/services/transcribe.ts
// 音声チャンクを Supabase Edge Function (transcribe) 経由で文字起こしする

import { supabase } from '../lib/supabase';

export interface TranscribeResult {
  transcript: string;    // smart_format あり（表示・AI用）
  rawTranscript: string; // smart_format なし（"うん"等の検出用）
}

export async function transcribeChunk(chunk: ArrayBuffer): Promise<TranscribeResult | null> {
  // supabase.functions.invoke は JSON しか送れないため fetch を直接使う
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/\/$/, '');
  const res = await fetch(`${supabaseUrl}/functions/v1/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: chunk,
  });

  if (!res.ok) {
    console.warn('[transcribe] エラー:', res.status, await res.text());
    return null;
  }

  const { transcript, rawTranscript } = await res.json();
  if (!transcript) return null;
  return { transcript, rawTranscript: rawTranscript ?? transcript };
}
