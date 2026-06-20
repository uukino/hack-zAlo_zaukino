// src/hooks/useConversation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { transcribeChunk } from '../services/transcribe';
import { requestMicPermission, initAudio, startAudio, stopAudio } from '../services/audio';
import type { ConversationStartResponse, TranscriptHandleResponse } from '../types';

async function extractFunctionError(label: string, error: unknown): Promise<string> {
  const base = error instanceof Error ? error.message : String(error);
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const body = await (error as { context: Response }).context.text();
      const detail = `[${label}] ${base} | body: ${body}`;
      console.error(detail);
      return detail;
    } catch { /* ignore */ }
  }
  const detail = `[${label}] ${base}`;
  console.error(detail);
  return detail;
}

export function useConversation(
  onAssistantReply?: (reply: string) => void,
  onUserTranscript?: (transcript: string, id: string) => void,
  onUnDetected?: (id: string) => void,
) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);

  const handleFinalTranscript = useCallback(async (
    convId: string,
    transcript: string,
    rawTranscript: string,
  ) => {
    console.log('[useConversation] 文字起こし確定:', transcript);
    const userMsgId = Date.now().toString() + '_u';
    onUserTranscript?.(transcript, userMsgId);
    const { data, error } = await supabase.functions.invoke<TranscriptHandleResponse>(
      'handle-transcript',
      { body: { conversationId: convId, transcript, rawTranscript } },
    );
    if (error) {
      const detail = await extractFunctionError('handle-transcript', error);
      setCallError(detail);
    } else if (data?.assistantReply) {
      if (data.unDetected) {
        onUnDetected?.(userMsgId);
      }
      onAssistantReply?.(data.assistantReply);
    }
  }, [onAssistantReply, onUserTranscript, onUnDetected]);

  const startConversation = useCallback(async () => {
    setCallError(null);

    const permitted = await requestMicPermission();
    if (!permitted) {
      setCallError('[startConversation] マイクの使用が許可されませんでした');
      return;
    }

    const { data, error } = await supabase.functions.invoke<ConversationStartResponse>(
      'start-conversation',
    );
    if (error) {
      setCallError(await extractFunctionError('start-conversation', error));
      return;
    }
    if (!data) {
      setCallError('[start-conversation] レスポンスデータが空です');
      return;
    }

    setConversationId(data.conversationId);
    conversationIdRef.current = data.conversationId;

    initAudio();
    startAudio(async (chunk) => {
      const convId = conversationIdRef.current;
      if (!convId) return;

      const result = await transcribeChunk(chunk);
      if (result) {
        await handleFinalTranscript(convId, result.transcript, result.rawTranscript);
      }
    });
  }, [handleFinalTranscript]);

  const stopConversation = useCallback(() => {
    stopAudio();
    conversationIdRef.current = null;
    setConversationId(null);
    setCallError(null);
  }, []);

  useEffect(() => {
    return () => {
      stopAudio();
      conversationIdRef.current = null;
    };
  }, []);

  return { conversationId, callError, startConversation, stopConversation };
}
