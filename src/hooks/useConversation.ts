// src/hooks/useConversation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { connectToDeepgram, sendAudioChunk } from '../services/deepgram';
import { requestMicPermission, initAudio, startAudio, stopAudio } from '../services/audio';
import type { ConversationStartResponse, TranscriptHandleResponse } from '../types';

export function useConversation() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleFinalTranscript = useCallback(async (convId: string, transcript: string) => {
    const { error } = await supabase.functions.invoke<TranscriptHandleResponse>(
      'handle-transcript',
      { body: { conversationId: convId, transcript } },
    );
    if (error) {
      console.warn('handle-transcript 呼び出しエラー:', error);
    }
    // assistantReply はmessagesテーブルへの INSERT をRealtimeで受け取るためここでは不要
  }, []);

  const startConversation = useCallback(async () => {
    const permitted = await requestMicPermission();
    if (!permitted) {
      console.warn('マイクの使用が許可されませんでした');
      return;
    }

    const { data, error } = await supabase.functions.invoke<ConversationStartResponse>(
      'start-conversation',
    );
    if (error || !data) {
      console.warn('start-conversation 呼び出しエラー:', error);
      return;
    }

    setConversationId(data.conversationId);

    const ws = connectToDeepgram({
      accessToken: data.deepgramAccessToken,
      onFinalTranscript: (transcript) => handleFinalTranscript(data.conversationId, transcript),
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
  }, []);

  // アンマウント時にも確実に接続を閉じる
  // （ボタンを押さずにアプリがバックグラウンド移行・クラッシュした場合のリーク防止）
  useEffect(() => {
    return () => {
      stopAudio();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  return { conversationId, startConversation, stopConversation };
}
