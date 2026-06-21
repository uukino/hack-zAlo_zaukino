// supabase/functions/fortune/index.ts
//
// 実行環境: Deno(Supabase Edge Functions)
// 役割: クライアントから渡された運勢ランクと雲量をもとに、
//       その運勢に合ったメッセージをGroq(OpenAI互換API)に生成してもらう

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RequestBody {
  fortuneLevel: string;
  cloudCover: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const TAG = '[fortune]';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

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

  const { fortuneLevel, cloudCover }: RequestBody = await req.json();
  if (!fortuneLevel || typeof cloudCover !== 'number') {
    console.error(`${TAG} 3. バリデーション失敗: fortuneLevel=${fortuneLevel} cloudCover=${cloudCover}`);
    return new Response('fortuneLevel と cloudCover は必須です', { status: 400 });
  }
  console.log(`${TAG} 3. リクエストボディ確認: fortuneLevel=${fortuneLevel} cloudCover=${cloudCover}%`);

  console.log(`${TAG} 4. Groq API 呼び出し開始`);
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        {
          role: 'system',
          content:
            'あなたは占い師です。ユーザーの今日の運勢ランクと、その判定根拠である現在地の雲量(%)が与えられます。' +
            '運勢に合った気の利いた一言メッセージを40〜80文字程度の日本語で、絵文字を使わずに作成してください。' +
            'メッセージ本文のみを出力し、前置きや説明は不要です。',
        },
        {
          role: 'user',
          content: `運勢ランク: ${fortuneLevel}\n雲量: ${cloudCover}%`,
        },
      ],
    }),
  });

  console.log(`${TAG} 4. Groq API レスポンス: status=${groqRes.status}`);
  if (!groqRes.ok) {
    const body = await groqRes.text();
    console.error(`${TAG} 4. Groq API 失敗: status=${groqRes.status} body=${body}`);
    return new Response(`Groq呼び出しに失敗しました: ${groqRes.status} ${body}`, { status: 502 });
  }

  const groqData = await groqRes.json();
  const message: string = groqData.choices[0].message.content;
  console.log(`${TAG} 5. 生成メッセージ取得: "${message.slice(0, 30)}..."`);

  return new Response(JSON.stringify({ message }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
