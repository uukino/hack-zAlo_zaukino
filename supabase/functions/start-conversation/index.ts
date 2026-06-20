// supabase/functions/start-conversation/index.ts
//
// 実行環境: Deno(Supabase Edge Functions)
// 役割:
//  1. 会話ごとの性格をランダムに決定し、conversationsテーブルに保存する
//  2. Deepgramの一時アクセストークンを発行し、クライアントに返す
//     (クライアントはこのトークンでDeepgramへ直接WebSocket接続する)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const personalityPresets: string[] = [
  'あなたは皮肉屋で論理的な性格です。感情表現は少なく、事実を淡々と述べます。',
  'あなたは明るく好奇心旺盛な性格です。質問を重ねて会話を広げます。',
];

const TAG = '[start-conversation]';

Deno.serve(async (req: Request) => {
  console.log(`${TAG} 1. リクエスト受信`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader);

  if (!user) {
    console.error(`${TAG} 2. 認証失敗: Authorization ヘッダーが無効または未設定`);
    return new Response('Unauthorized', { status: 401 });
  }
  console.log(`${TAG} 2. 認証成功: user_id=${user.id}`);

  const personality =
    personalityPresets[Math.floor(Math.random() * personalityPresets.length)];
  console.log(`${TAG} 3. 性格決定: "${personality.slice(0, 20)}..."`);

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, personality })
    .select()
    .single();

  if (error || !conversation) {
    console.error(`${TAG} 4. conversations INSERT 失敗: ${error?.message ?? '不明なエラー'}`);
    return new Response(error?.message ?? 'conversation作成に失敗しました', { status: 500 });
  }
  console.log(`${TAG} 4. conversations INSERT 成功: conversation_id=${conversation.id}`);

  const dgRes = await fetch('https://api.deepgram.com/v1/projects/%7BPROJECT_ID%7D/keys', {
    method: 'POST',
    headers: {
      Authorization: `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 3600 }),
  });

  console.log(`${TAG} 5. Deepgram API レスポンス: status=${dgRes.status}`);
  if (!dgRes.ok) {
    const body = await dgRes.text();
    console.error(`${TAG} 5. Deepgramトークン発行失敗: status=${dgRes.status} body=${body}`);
    return new Response('Deepgramトークンの発行に失敗しました', { status: 502 });
  }

  const dgToken = await dgRes.json();
  console.log(`${TAG} 6. Deepgramトークン取得成功: キーあり=${!!dgToken.access_token}`);

  console.log(`${TAG} 7. 正常終了: conversation_id=${conversation.id}`);
  return new Response(
    JSON.stringify({
      conversationId: conversation.id,
      deepgramAccessToken: dgToken.access_token,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
