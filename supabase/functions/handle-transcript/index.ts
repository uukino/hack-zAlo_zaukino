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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const TAG = '[handle-transcript]';

Deno.serve(async (req: Request) => {
  console.log(`${TAG} 1. リクエスト受信`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authToken = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await supabase.auth.getUser(authToken);
  if (!user) {
    console.error(`${TAG} 2. 認証失敗: Authorization ヘッダーが無効または未設定`);
    return new Response('Unauthorized', { status: 401 });
  }
  console.log(`${TAG} 2. 認証成功: user_id=${user.id}`);

  const { conversationId, transcript }: RequestBody = await req.json();
  if (!conversationId || !transcript) {
    console.error(`${TAG} 3. バリデーション失敗: conversationId=${conversationId} transcript=${!!transcript}`);
    return new Response('conversationId と transcript は必須です', { status: 400 });
  }
  console.log(`${TAG} 3. リクエストボディ確認: conversationId=${conversationId} transcript="${transcript.slice(0, 30)}..."`);

  const unDetected = containsUn(transcript);
  console.log(`${TAG} 4. 「うん」判定: ${unDetected}`);
  if (unDetected) {
    const { error: evError } = await supabase.from('events').insert({
      conversation_id: conversationId,
      type: 'un_detected',
      transcript,
    });
    if (evError) {
      console.error(`${TAG} 4. events INSERT 失敗: ${evError.message}`);
    } else {
      console.log(`${TAG} 4. events INSERT 成功`);
    }
  }

  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'user',
    content: transcript,
  });
  if (msgError) {
    console.error(`${TAG} 5. messages(user) INSERT 失敗: ${msgError.message}`);
  } else {
    console.log(`${TAG} 5. messages(user) INSERT 成功`);
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('personality')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (convError || !conversation) {
    console.error(`${TAG} 6. conversations SELECT 失敗: ${convError?.message ?? '該当なし'}`);
    return new Response('会話情報の取得に失敗しました', { status: 500 });
  }
  console.log(`${TAG} 6. conversations SELECT 成功`);

  const { data: history, error: historyError } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at');

  if (historyError || !history) {
    console.error(`${TAG} 7. messages SELECT 失敗: ${historyError?.message ?? '該当なし'}`);
    return new Response('会話履歴の取得に失敗しました', { status: 500 });
  }
  console.log(`${TAG} 7. messages SELECT 成功: ${history.length} 件`);

  const chatMessages: ChatMessage[] = [
    { role: 'system', content: conversation.personality },
    ...history.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
  ];

  console.log(`${TAG} 8. OpenAI API 呼び出し開始: メッセージ数=${chatMessages.length}`);
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

  console.log(`${TAG} 8. OpenAI API レスポンス: status=${openaiRes.status}`);
  if (!openaiRes.ok) {
    const body = await openaiRes.text();
    console.error(`${TAG} 8. OpenAI API 失敗: status=${openaiRes.status} body=${body}`);
    return new Response('ChatGPT呼び出しに失敗しました', { status: 502 });
  }

  const completion = await openaiRes.json();
  const assistantReply: string = completion.choices[0].message.content;
  console.log(`${TAG} 9. OpenAI 返答取得: "${assistantReply.slice(0, 30)}..."`);

  const { error: replyError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role: 'assistant',
    content: assistantReply,
  });
  if (replyError) {
    console.error(`${TAG} 10. messages(assistant) INSERT 失敗: ${replyError.message}`);
  } else {
    console.log(`${TAG} 10. messages(assistant) INSERT 成功`);
  }

  console.log(`${TAG} 11. 正常終了`);
  return new Response(JSON.stringify({ assistantReply }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
