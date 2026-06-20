// src/hooks/useConversation.ts
import { useCallback, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { connectToDeepgram } from '../services/deepgram';
import type { ConversationStartResponse, TranscriptHandleResponse } from '../types';

export function useConversation() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleFinalTranscript = useCallback(async (convId: string, transcript: string) => {
    const { data, error } = await supabase.functions.invoke<TranscriptHandleResponse>(
      'handle-transcript',
      { body: { conversationId: convId, transcript } },
    );
    if (error) {
      console.warn('handle-transcript 呼び出しエラー:', error);
      return;
    }
    // data?.assistantReply をUI側の状態に反映する処理をここに追加する
  }, []);

  const startConversation = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<ConversationStartResponse>(
      'start-conversation',
    );
    if (error || !data) {
      console.warn('start-conversation 呼び出しエラー:', error);
      return;
    }

    setConversationId(data.conversationId);

    wsRef.current = connectToDeepgram({
      accessToken: data.deepgramAccessToken,
      onFinalTranscript: (transcript) => handleFinalTranscript(data.conversationId, transcript),
    });
  }, [handleFinalTranscript]);

  const stopConversation = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setConversationId(null);
  }, []);

  return { conversationId, startConversation, stopConversation };
}
