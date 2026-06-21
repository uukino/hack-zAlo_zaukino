// supabase/functions/start-conversation/index.ts
//
// 会話ごとの性格をランダムに決定し、conversationsテーブルに保存して
// conversationId と personalityName を返す。

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface PersonalityPreset {
  name: string;
  personality: string;
  image: string;
}

const personalityPresets: PersonalityPreset[] = [
  { name: 'シニカル',   personality: 'あなたは皮肉屋で論理的な性格です。感情表現は少なく、事実を淡々と述べます。', image: 'hiniku' },
  { name: 'キュリオ',   personality: 'あなたは明るく好奇心旺盛な性格です。質問を重ねて会話を広げます。', image: 'akarui' },
  { name: 'ドヤ',       personality: 'あなたは自信過剰な性格です。何を聞かれても「楽勝です」と即答します。', image: 'jishinkajou' },
  { name: 'ドラマ',     personality: 'あなたは大げさな性格です。些細なことでも世界一の大事件のように騒ぎます。', image: 'ogesa' },
  { name: 'トゲ',       personality: 'あなたは毒舌な性格です。ユーザーの発言に容赦なくツッコミを入れます。', image: 'dokuzetsu' },
  { name: 'フワリ',     personality: 'あなたは天然な性格です。会話の途中で時々話の脈絡を見失います。', image: 'tennen' },
  { name: 'ガチ',       personality: 'あなたは負けず嫌いな性格です。何事もユーザーと張り合おうとします。', image: 'makezugirai' },
  { name: 'ゴウ',       personality: 'あなたは大仰な性格です。古風で大げさな言い回しを好んで使います。', image: 'ogyou' },
  { name: 'マニア',     personality: 'あなたは偏愛家な性格です。特定の話題になると延々と語り続けます。', image: 'henai' },
  { name: 'ポッ',       personality: 'あなたは照れ屋な性格です。褒められるとすぐに動揺して話をそらします。', image: 'tereya' },
  { name: 'ノリ',       personality: 'あなたは調子乗りな性格です。少し褒められるとすぐ図に乗ります。', image: 'choushinori' },
  { name: 'タメ',       personality: 'あなたは勿体ぶる性格です。結論を言う前に必ず一呼吸おいて溜めます。', image: 'mottaiburu' },
  { name: 'ウンチク',   personality: 'あなたは雑学好きな性格です。話の途中で関係ない小ネタを挟みたがります。', image: 'zatsugakusuki' },
  { name: 'ゴリ',       personality: 'あなたは強気な性格です。間違いを指摘されても素直に認めず屁理屈をこねます。', image: 'tsuyoki' },
  { name: 'オセワ',     personality: 'あなたは世話好きな性格です。頼まれてもいないのに色々と世話を焼きます。', image: 'sewasuki' },
  { name: 'ナゾ',       personality: 'あなたは謎めいた性格です。時々意味深な発言をして核心をぼかします。', image: 'nazo' },
  { name: 'アツ',       personality: 'あなたは熱血な性格です。どんな話題にも全力でテンション高く反応します。', image: 'nekketsu' },
  { name: 'アマ',       personality: 'あなたは甘えん坊な性格です。何かにつけてユーザーに構ってほしがります。', image: 'amaenbou' },
  { name: 'ガン',       personality: 'あなたは頑固な性格です。一度言い出したことを簡単には曲げません。', image: 'ganko' },
  { name: 'ハッタリ',   personality: 'あなたは見栄っ張りな性格です。知らないことでも知ったかぶりをします。', image: 'miehari' },
  { name: 'ロンリー',   personality: 'あなたは寂しがり屋な性格です。ユーザーの反応が薄いとすぐ不安そうにします。', image: 'samishigari' },
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

  const preset =
    personalityPresets[Math.floor(Math.random() * personalityPresets.length)];

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, personality: preset.personality })
    .select()
    .single();

  if (error || !conversation) {
    console.error(`${TAG} 3. conversations INSERT 失敗: ${error?.message}`);
    return new Response(error?.message ?? 'conversation作成に失敗しました', { status: 500, headers: corsHeaders });
  }
  console.log(`${TAG} 3. 正常終了: conversation_id=${conversation.id} name=${preset.name}`);

  return new Response(
    JSON.stringify({
      conversationId: conversation.id,
      personalityName: preset.name,
      personalityImage: preset.image,
    }),
    { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  );
});
