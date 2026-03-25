import { kv } from '@vercel/kv';

export default async function handler(request, response) {
  // CORSの設定 (ローカル検証用)
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const LEADERBOARD_KEY = 'hacsura_global_ranking';

  try {
    if (request.method === 'GET') {
      // トップランキングを降順で取得（上位10件）
      const leaderboard = await kv.zrange(LEADERBOARD_KEY, 0, 9, { rev: true, withScores: true });
      
      const formatted = [];
      if (leaderboard && leaderboard.length > 0) {
        // kv.zrange returns either flat array or objects depending on client version
        if (typeof leaderboard[0] === 'object') {
          for (const item of leaderboard) {
            formatted.push({ name: item.member, score: item.score });
          }
        } else {
          for (let i = 0; i < leaderboard.length; i += 2) {
            formatted.push({ name: String(leaderboard[i]), score: Number(leaderboard[i + 1]) });
          }
        }
      }
      return response.status(200).json(formatted);
      
    } else if (request.method === 'POST') {
      const { name, score } = request.body;
      
      if (!name || typeof score !== 'number') {
        return response.status(400).json({ error: 'Invalid name or score' });
      }

      // 既存のスコアを取得
      const currentScore = await kv.zscore(LEADERBOARD_KEY, name);
      
      // 新規、または既存よりスコアが高い場合のみハイスコアを更新
      if (currentScore === null || score > currentScore) {
        await kv.zadd(LEADERBOARD_KEY, { score: score, member: name });
        return response.status(200).json({ success: true, updated: true, score });
      }
      
      return response.status(200).json({ success: true, updated: false, score: currentScore });
    }
    
    return response.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('KV Error:', error);
    // Vercel KVが未連携、またはエラー時の回避策
    return response.status(200).json({ 
      error: 'KV connection error', 
      details: 'Vercel KVの連携が必要です。プロジェクトの設定でKVが正しくLinkされているか確認してください。',
      fallback: true,
      data: []
    });
  }
}
