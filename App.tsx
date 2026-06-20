// App.tsx
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button, FlatList } from 'react-native';
import { supabase } from './src/lib/supabase';
import { useConversation } from './src/hooks/useConversation';
import type { Message } from './src/types';

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { startConversation } = useConversation();

  useEffect(() => {
    // 1. 最初に、過去のメッセージを全件取得する
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data) setMessages(data as Message[]);
    };
    fetchMessages();

    // 2. ★これがWebSocket（Realtime）処理★
    // データベースの 'messages' テーブルで INSERT（データ追加）が起きたらリアルタイムに受け取る
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        },
      )
      .subscribe();

    // 画面が閉じるときにWebSocketの接続を切断する
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>チャットテスト</Text>
      <Button title="会話を開始" onPress={startConversation} />
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.messageBox}>
            <Text>{item.content}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  messageBox: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
});
