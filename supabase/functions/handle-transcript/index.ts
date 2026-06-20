// supabase/functions/handle-transcript/index.ts
//
// 実行環境: Deno(Supabase Edge Functions)
// 役割:
//  1. Deepgramの確定テキストを受け取る
//  2. 「うん」を含むかどうかを判定し、含む場合はeventsテーブルに記録する
//     (単語中に含まれる場合も対象とするため、単純な部分文字列一致を使用)
//  3. ユーザー発言をmessagesテーブルに保存する
//  4. 会話の性格(system)と履歴を取得し、ChatGPT(OpenAI API)に送信する
//  5. アシスタントの返答をmessagesテーブルに保存し、クライアントに返す

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RequestBody {
  conversationId: string;
  transcript: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function containsUn(transcript: string): boolean {
  return transcript.includes('うん');
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authToken = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await supabase.auth.getUser(authToken);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { conversationId, transcript }: RequestBody = await req.json();

  if (!conversationId || !transcript) {
    return new Response('conversationId と transcript は必須です', { status: 400 });
  }

  // 「うん」判定(部分文字列一致。「運転」等の単語中の出現も検出対象とする)
  if (containsUn(transcript)) {
    await supabase.from('events').insert({
      conversation_id: conversationId,
      type: 'un_detected',
      transcript,
    });
    // イベントの具体的な処理内容(通知・アニメーション等)は別途実装する
  }

  // ユーザー発言を保存
  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: transcript,
  });

  // 性格設定を取得
  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('personality')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (convError || !conversation) {
    return new Response('会話情報の取得に失敗しました', { status: 500 });
  }

  // 会話履歴を取得
  const { data: history, error: historyError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at');

  if (historyError || !history) {
    return new Response('会話履歴の取得に失敗しました', { status: 500 });
  }

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: conversation.personality },
    ...history.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
  ];

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: chatMessages,
    }),
  });

  if (!openaiRes.ok) {
    return new Response('ChatGPT呼び出しに失敗しました', { status: 502 });
  }

  const completion = await openaiRes.json();
  const assistantReply: string = completion.choices[0].message.content;

  await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantReply,
  });

  return new Response(JSON.stringify({ assistantReply }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
