// App.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, Button, FlatList } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';
import * as Speech from 'expo-speech';
import { muteAudio, unmuteAudio } from './src/services/audio';
import { supabase } from './src/lib/supabase';
import { useConversation } from './src/hooks/useConversation';
import { LoginScreen } from './src/components/LoginScreen';
import { SandCrumbleText } from './src/components/SandCrumbleText';
import { ExplodeText } from './src/components/ExplodeText';
import { CarCrossText } from './src/components/CarCrossText';
import { CountdownEffectText } from './src/components/CountdownEffectText';
import { setupNotifications, notifyUnDetected } from './src/services/notifications';
import { getCurrentCloudCover } from './src/services/weather';
import { getFortuneLevel } from './src/utils/fortune';
import type { FortuneResponse, Message } from './src/types';

type UnEffect = 'crumble' | 'explode' | 'car' | 'countdown';
const UN_EFFECTS: UnEffect[] = ['crumble', 'explode', 'car', 'countdown'];

type LocalMessage =
  | (Message & { effect?: UnEffect })
  | { id: string; role: 'system'; content: string; created_at: string; conversation_id: string };

function makeSystemMsg(content: string): LocalMessage {
  return { id: Date.now().toString() + Math.random(), role: 'system', content, created_at: new Date().toISOString(), conversation_id: '' };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const flatListRef = useRef<FlatList<LocalMessage>>(null);

  // ── 認証状態の監視 ──────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── 通知権限のセットアップ ──────────────────────────
  useEffect(() => {
    setupNotifications();
  }, []);

  const addMessage = useCallback((msg: LocalMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleAssistantReply = useCallback((reply: string) => {
    addMessage({ id: Date.now().toString() + '_a', role: 'assistant', content: reply, created_at: new Date().toISOString(), conversation_id: '' });
    muteAudio();
    Speech.speak(reply, {
      language: 'ja',
      onDone: unmuteAudio,
      onError: unmuteAudio,
    });
  }, [addMessage]);

  const handleUserTranscript = useCallback((transcript: string, id: string) => {
    addMessage({ id, role: 'user', content: transcript, created_at: new Date().toISOString(), conversation_id: '' });
  }, [addMessage]);

  const [carCrossKey, setCarCrossKey] = useState(0);
  const triggerCarCross = useCallback(() => setCarCrossKey((k) => k + 1), []);

  const handleUnDetected = useCallback((id: string) => {
    notifyUnDetected();
    const effect = UN_EFFECTS[Math.floor(Math.random() * UN_EFFECTS.length)];
    if (effect === 'car') triggerCarCross();
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, effect } : m)));
  }, [triggerCarCross]);

  const handleUnseiDetected = useCallback(async () => {
    const cloudCover = await getCurrentCloudCover();
    if (cloudCover === null) {
      addMessage(makeSystemMsg('── 運勢の判定に失敗しました（位置情報を取得できません）──'));
      return;
    }

    const fortuneLevel = getFortuneLevel(cloudCover);
    const { data, error } = await supabase.functions.invoke<FortuneResponse>('fortune', {
      body: { fortuneLevel, cloudCover },
    });
    if (error || !data?.message) {
      addMessage(makeSystemMsg('── 運勢メッセージの取得に失敗しました ──'));
      return;
    }

    addMessage({
      id: Date.now().toString() + '_fortune',
      role: 'assistant',
      content: `【今日の運勢: ${fortuneLevel}】${data.message}`,
      created_at: new Date().toISOString(),
      conversation_id: '',
    });
    muteAudio();
    Speech.speak(data.message, { language: 'ja', onDone: unmuteAudio, onError: unmuteAudio });
  }, [addMessage]);

  const { conversationId, callError, startConversation: _start, stopConversation: _stop } = useConversation(
    handleAssistantReply,
    handleUserTranscript,
    handleUnDetected,
    handleUnseiDetected,
  );

  const startConversation = useCallback(async () => {
    addMessage(makeSystemMsg('── 会話を開始しました ──'));
    await _start();
  }, [_start, addMessage]);

  const stopConversation = useCallback(() => {
    _stop();
    addMessage(makeSystemMsg('── 会話を終了しました ──'));
  }, [_stop, addMessage]);

  const handleLogout = useCallback(async () => {
    _stop();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id);
      if (convs && convs.length > 0) {
        const ids = convs.map((c: { id: string }) => c.id);
        await supabase.from('events').delete().in('conversation_id', ids);
        await supabase.from('messages').delete().in('conversation_id', ids);
        await supabase.from('conversations').delete().in('id', ids);
      }
    }
    setMessages([]);
    await supabase.auth.signOut();
  }, [_stop]);

  // 新メッセージが来たら末尾へスクロール
  useEffect(() => {
    if (messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  if (!session) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>AI会話</Text>
          <Button title="ログアウト" onPress={handleLogout} />
        </View>

        {/* メッセージ一覧 */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            if (item.role === 'system') {
              return <Text style={styles.systemLog}>{item.content}</Text>;
            }
            return (
              <View
                style={[
                  styles.bubble,
                  item.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                <Text style={styles.roleLabel}>
                  {item.role === 'user' ? 'あなた' : 'AI'}
                </Text>
                {'effect' in item && item.effect === 'crumble' && (
                  <SandCrumbleText text={item.content} trigger style={styles.messageText} />
                )}
                {'effect' in item && item.effect === 'explode' && (
                  <ExplodeText text={item.content} trigger style={styles.messageText} />
                )}
                {'effect' in item && item.effect === 'countdown' && (
                  <CountdownEffectText
                    text={item.content}
                    trigger
                    style={styles.messageText}
                    onCarEffect={triggerCarCross}
                  />
                )}
                {(!('effect' in item) || item.effect === undefined || item.effect === 'car') && (
                  <Text style={styles.messageText}>{item.content}</Text>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.emptyText}>「会話を開始」を押してください</Text>
          }
        />

        {/* フッター */}
        <View style={styles.footer}>
          {callError && (
            <Text style={styles.errorText}>{callError}</Text>
          )}
          {conversationId && (
            <Text style={styles.recordingIndicator}>● 録音中</Text>
          )}
          <Button
            title={conversationId ? '会話を終了' : '会話を開始'}
            onPress={conversationId ? stopConversation : startConversation}
          />
        </View>

        {/* 画面下部を車が横切る演出（特定のメッセージに紐づかない） */}
        <CarCrossText key={carCrossKey} trigger={carCrossKey > 0} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  list: { flex: 1 },
  listContent: { padding: 12, gap: 8 },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#DCF8C6',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  roleLabel: { fontSize: 11, color: '#888', marginBottom: 2 },
  messageText: { fontSize: 15 },
  systemLog: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginVertical: 6,
  },
  emptyText: {
    textAlign: 'center',
    color: '#aaa',
    marginTop: 60,
    fontSize: 14,
  },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#e0e0e0',
    alignItems: 'center',
    gap: 8,
  },
  recordingIndicator: { color: '#e53935', fontSize: 13 },
  errorText: { color: '#e53935', fontSize: 12, textAlign: 'center' },
});
