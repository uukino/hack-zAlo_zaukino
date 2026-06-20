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

Deno.serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader);
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const personality =
    personalityPresets[Math.floor(Math.random() * personalityPresets.length)];

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, personality })
    .select()
    .single();

  if (error || !conversation) {
    return new Response(error?.message ?? 'conversation作成に失敗しました', { status: 500 });
  }

  // Deepgram一時トークン発行(モバイル向けにTTLを1時間に設定)
  const dgRes = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: 3600 }),
  });

  if (!dgRes.ok) {
    return new Response('Deepgramトークンの発行に失敗しました', { status: 502 });
  }
  const dgToken = await dgRes.json();

  return new Response(
    JSON.stringify({
      conversationId: conversation.id,
      deepgramAccessToken: dgToken.access_token,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
