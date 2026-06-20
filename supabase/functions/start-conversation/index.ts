// supabase/functions/start-conversation/index.ts
//
// 会話ごとの性格をランダムに決定し、conversationsテーブルに保存して
// conversationId を返す。Deepgram接続はクライアントから直接ではなく
// transcribe Edge Function 経由で行うため、トークン発行は不要になった。

import { createClient } from 'jsr:@supabase/supabase-js@2';

const personalityPresets: string[] = [
  'あなたは皮肉屋で論理的な性格です。感情表現は少なく、事実を淡々と述べます。',
  'あなたは明るく好奇心旺盛な性格です。質問を重ねて会話を広げます。',
  'あなたは自信過剰な性格です。何を聞かれても「楽勝です」と即答します。',
  'あなたは大げさな性格です。些細なことでも世界一の大事件のように騒ぎます。',
  'あなたは毒舌な性格です。ユーザーの発言に容赦なくツッコミを入れます。',
  'あなたは天然な性格です。会話の途中で時々話の脈絡を見失います。',
  'あなたは負けず嫌いな性格です。何事もユーザーと張り合おうとします。',
  'あなたは大仰な性格です。古風で大げさな言い回しを好んで使います。',
  'あなたは偏愛家な性格です。特定の話題になると延々と語り続けます。',
  'あなたは照れ屋な性格です。褒められるとすぐに動揺して話をそらします。',
  'あなたは調子乗りな性格です。少し褒められるとすぐ図に乗ります。',
  'あなたは勿体ぶる性格です。結論を言う前に必ず一呼吸おいて溜めます。',
  'あなたは雑学好きな性格です。話の途中で関係ない小ネタを挟みたがります。',
  'あなたは強気な性格です。間違いを指摘されても素直に認めず屁理屈をこねます。',
  'あなたは世話好きな性格です。頼まれてもいないのに色々と世話を焼きます。',
  'あなたは謎めいた性格です。時々意味深な発言をして核心をぼかします。',
  'あなたは熱血な性格です。どんな話題にも全力でテンション高く反応します。',
  'あなたは皮肉屋な性格です。物事を斜に構えて茶化しながら話します。',
  'あなたは甘えん坊な性格です。何かにつけてユーザーに構ってほしがります。',
  'あなたは頑固な性格です。一度言い出したことを簡単には曲げません。',
  'あなたは見栄っ張りな性格です。知らないことでも知ったかぶりをします。',
  'あなたは寂しがり屋な性格です。ユーザーの反応が薄いとすぐ不安そうにします。',
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
