// supabase/functions/transcribe/index.ts
//
// 音声チャンク(raw PCM 16-bit signed, 16kHz, mono)を受け取り、
// Deepgram REST API で文字起こしして確定テキストのみ返す。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const TAG = '[transcribe]';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const audioData = await req.arrayBuffer();
  if (!audioData || audioData.byteLength === 0) {
    return new Response('音声データが空です', { status: 400, headers: corsHeaders });
  }

  console.log(`${TAG} 音声受信: ${audioData.byteLength} bytes`);

  // encoding=linear16 をURLクエリで指定するのが Deepgram の正しい方法
  const dgRes = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true&encoding=linear16&sample_rate=16000&channels=1',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
        'Content-Type': 'audio/raw',
      },
      body: audioData,
    },
  );

  if (!dgRes.ok) {
    const body = await dgRes.text();
    console.error(`${TAG} Deepgram エラー: status=${dgRes.status} body=${body}`);
    return new Response(`Deepgram 文字起こし失敗: ${dgRes.status}`, { status: 502, headers: corsHeaders });
  }

  const result = await dgRes.json();
  const transcript: string =
    result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';

  console.log(`${TAG} 文字起こし結果: "${transcript}"`);

  return new Response(JSON.stringify({ transcript }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
