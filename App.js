// App.js
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Button, FlatList } from 'react-native';
import { supabase } from './supabase';

export default function App() {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // 1. 最初に、過去のメッセージを全件取得する
    const fetchMessages = async () => {
      const { data, error } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (!error) setMessages(data);
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
          // 新しいメッセージを既存のリストの末尾に追加
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    // 画面が閉じるときにWebSocketの接続を切断する
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // テスト送信用の関数（Supabaseにデータを送る）
  const sendMessage = async () => {
    const { error } = await supabase
      .from('messages')
      .insert([{ content: `テストメッセージ (${new Date().toLocaleTimeString()})` }]);
    if (error) console.log('送信エラー:', error);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>チャットテスト</Text>
      <Button title="メッセージを送信（テスト）" onPress={sendMessage} />
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