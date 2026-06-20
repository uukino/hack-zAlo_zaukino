// supabase/functions/start-conversation/index.ts
//
// 会話ごとの性格をランダムに決定し、conversationsテーブルに保存して
// conversationId を返す。Deepgram接続はクライアントから直接ではなく
// transcribe Edge Function 経由で行うため、トークン発行は不要になった。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const personalityPresets: string[] = [
  'あなたは皮肉屋で論理的な性格です。感情表現は少なく、事実を淡々と述べます。',
  'あなたは明るく好奇心旺盛な性格です。質問を重ねて会話を広げます。',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const TAG = '[start-conversation]';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  console.log(`${TAG} 1. リクエスト受信`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
  const { data: { user } } = await supabase.auth.getUser(authHeader);

  if (!user) {
    console.error(`${TAG} 2. 認証失敗`);
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }
  console.log(`${TAG} 2. 認証成功: user_id=${user.id}`);

  const personality =
    personalityPresets[Math.floor(Math.random() * personalityPresets.length)];

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, personality })
    .select()
    .single();

  if (error || !conversation) {
    console.error(`${TAG} 3. conversations INSERT 失敗: ${error?.message}`);
    return new Response(error?.message ?? 'conversation作成に失敗しました', { status: 500, headers: corsHeaders });
  }
  console.log(`${TAG} 3. 正常終了: conversation_id=${conversation.id}`);

  return new Response(
    JSON.stringify({ conversationId: conversation.id }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  );
});
