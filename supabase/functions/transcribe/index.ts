// supabase/functions/transcribe/index.ts
//
// 音声チャンク(raw PCM 16-bit signed, 16kHz, mono)を受け取り、
// Deepgram REST API で文字起こしして確定テキストのみ返す。
// smart_format あり（表示・AI用）と なし（検出用）を並列で取得する。

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const TAG = '[transcribe]';

const DG_BASE = 'https://api.deepgram.com/v1/listen?model=nova-2&language=ja&encoding=linear16&sample_rate=16000&channels=1';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const audioData = await req.arrayBuffer();
  if (!audioData || audioData.byteLength === 0) {
    return new Response('音声データが空です', { status: 400, headers: corsHeaders });
  }

  console.log(`${TAG} 音声受信: ${audioData.byteLength} bytes`);

  const dgHeaders = {
    Authorization: `Token ${Deno.env.get('DEEPGRAM_API_KEY')}`,
    'Content-Type': 'audio/raw',
  };

  // 表示・AI用（smart_format あり）と検出用（smart_format なし）を並列取得
  const [formattedRes, rawRes] = await Promise.all([
    fetch(`${DG_BASE}&smart_format=true`, { method: 'POST', headers: dgHeaders, body: audioData }),
    fetch(`${DG_BASE}&smart_format=false`, { method: 'POST', headers: dgHeaders, body: audioData }),
  ]);

  if (!formattedRes.ok) {
    const body = await formattedRes.text();
    console.error(`${TAG} Deepgram エラー: status=${formattedRes.status} body=${body}`);
    return new Response(`Deepgram 文字起こし失敗: ${formattedRes.status}`, { status: 502, headers: corsHeaders });
  }

  const [formattedData, rawData] = await Promise.all([
    formattedRes.json(),
    rawRes.ok ? rawRes.json() : Promise.resolve(null),
  ]);

  const transcript: string = formattedData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  const rawTranscript: string = rawData?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? transcript;

  console.log(`${TAG} 文字起こし: "${transcript}" / 検出用: "${rawTranscript}"`);

  return new Response(JSON.stringify({ transcript, rawTranscript }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
