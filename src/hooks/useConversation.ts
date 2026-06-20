// src/hooks/useConversation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { connectToDeepgram, sendAudioChunk } from '../services/deepgram';
import { requestMicPermission, initAudio, startAudio, stopAudio } from '../services/audio';
import type { ConversationStartResponse, TranscriptHandleResponse } from '../types';

// supabase.functions.invoke のエラーオブジェクトからできる限り詳細を取り出す
async function extractFunctionError(label: string, error: unknown): Promise<string> {
  const base = error instanceof Error ? error.message : String(error);

  // FunctionsHttpError はレスポンスボディを context プロパティに持つ
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const body = await (error as { context: Response }).context.text();
      const detail = `[${label}] ${base} | body: ${body}`;
      console.error(detail);
      return detail;
    } catch {
      // body の読み取りに失敗した場合はフォールスルー
    }
  }

  const detail = `[${label}] ${base}`;
  console.error(detail);
  return detail;
}

export function useConversation() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleFinalTranscript = useCallback(async (convId: string, transcript: string) => {
    const { error } = await supabase.functions.invoke<TranscriptHandleResponse>(
      'handle-transcript',
      { body: { conversationId: convId, transcript } },
    );
    if (error) {
      const detail = await extractFunctionError('handle-transcript', error);
      setCallError(detail);
    }
    // assistantReply は messages テーブルへの INSERT を Realtime で受け取るためここでは不要
  }, []);

  const startConversation = useCallback(async () => {
    setCallError(null);

    const permitted = await requestMicPermission();
    if (!permitted) {
      const detail = '[startConversation] マイクの使用が許可されませんでした';
      console.error(detail);
      setCallError(detail);
      return;
    }

    const { data, error } = await supabase.functions.invoke<ConversationStartResponse>(
      'start-conversation',
    );
    if (error) {
      const detail = await extractFunctionError('start-conversation', error);
      setCallError(detail);
      return;
    }
    if (!data) {
      const detail = '[start-conversation] レスポンスデータが空です';
      console.error(detail);
      setCallError(detail);
      return;
    }

    setConversationId(data.conversationId);

    const ws = connectToDeepgram({
      accessToken: data.deepgramAccessToken,
      onFinalTranscript: (transcript) => handleFinalTranscript(data.conversationId, transcript),
      onError: (e) => {
        const detail = `[Deepgram WebSocket] error event: ${JSON.stringify(e)}`;
        console.error(detail);
        setCallError(detail);
      },
    });
    wsRef.current = ws;

    initAudio();
    startAudio((chunk) => sendAudioChunk(ws, chunk));
  }, [handleFinalTranscript]);

  const stopConversation = useCallback(() => {
    stopAudio();
    wsRef.current?.close();
    wsRef.current = null;
    setConversationId(null);
    setCallError(null);
  }, []);

  // アンマウント時にも確実に接続を閉じる
  useEffect(() => {
    return () => {
      stopAudio();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { conversationId, callError, startConversation, stopConversation };
}
