// DOM要素
const diveBtn = document.getElementById('dive-btn');
const character = document.getElementById('character');
const battleLog = document.getElementById('battle-log');
const resultOverlay = document.getElementById('result-overlay');
const closeResultBtn = document.getElementById('close-result-btn');
const dropRarity = document.getElementById('drop-rarity');
const dropName = document.getElementById('drop-name');
const gameContainer = document.getElementById('game-container'); // 追加: 画面揺れ用
const shareXBtn = document.getElementById('share-x-btn'); // X共有ボタン

// ステータスUI
const statAtk = document.getElementById('stat-atk');
const statDef = document.getElementById('stat-def');
const statCrit = document.getElementById('stat-crit');

// 装備UI
const eqWeapon = document.getElementById('eq-weapon');
const eqArmor = document.getElementById('eq-armor');
const eqAccessory = document.getElementById('eq-accessory');

// スタミナ・マネタイズ関連UI
const adBtn = document.getElementById('ad-btn');
const staminaCountText = document.getElementById('stamina-count');
const adOverlay = document.getElementById('ad-overlay');
const adVideo = document.getElementById('ad-video');
const adTimerText = document.getElementById('ad-timer');
const adCloseBtn = document.getElementById('ad-close-btn');
let adTimerInterval;

const comboCountText = document.getElementById('combo-count');
const comboDisplay = document.getElementById('combo-display');

// 定数
const BASE_STATS = { atk: 10, def: 10, crit: 5 };
const MAX_STAMINA = 10;
const STAMINA_RECOVERY_MS = 10000; // テスト用に10秒で1回復
const SAVE_KEY = 'hacsura_save_data';

// 品質ランク判定関数（個体値可視化）
function getQualityRank(quality) {
    if (quality >= 1.4) return { rank: 'S', name: 'Rank S', class: 'rank-s' };
    if (quality >= 1.2) return { rank: 'A', name: 'Rank A', class: 'rank-a' };
    if (quality >= 1.0) return { rank: 'B', name: 'Rank B', class: 'rank-b' };
    if (quality >= 0.9) return { rank: 'C', name: 'Rank C', class: 'rank-c' };
    return { rank: 'D', name: 'Rank D', class: 'rank-d' };
}

// セーブデータ（状態管理）
let inventory = {}; 
let equipped = { weapon: null, armor: null, accessory: null };
// 各種フラグ・状態
let stamina = MAX_STAMINA;
let lastStaminaUpdate = Date.now();
let isBattling = false;
adTimerInterval = null; // adTimerIntervalはグローバルで宣言済みのため再代入のみ
let combo = 0;
let lastLoginDate = '';
let consecutiveLoginDays = 0;
const RANKING_KEY = 'hacsura_local_ranking';
let localRanking = [];
let dailyMissions = { date: '', playCount: 0, synthCount: 0, claimed: [false, false] };
let dailyBuff = null;
let forbiddenLastPlayed = localStorage.getItem('hacsura_forbidden_date') || ''; // 禁断ダンジョン最終プレイ日

// デイリーバフの抽選
function generateDailyBuff() {
    const buffs = [
        { type: 'NONE', name: '通常気候（環境バフなし）' },
        { type: 'SSR_UP', name: '大安吉日（通常時SSR確率3倍！）' },
        { type: 'SR_UP', name: '豊作の予感（通常時SR確率3倍！）' },
        { type: 'DOUBLE_SYNTH', name: '鍛冶屋のやる気（合成経験値2倍！）' }
    ];
    // NONE 10%, SSR 20%, SR 40%, Double 30%
    const rand = Math.random() * 100;
    if (rand < 10) dailyBuff = buffs[0];
    else if (rand < 30) dailyBuff = buffs[1];
    else if (rand < 70) dailyBuff = buffs[2];
    else dailyBuff = buffs[3];
}

// デイリーバフのUI更新
function updateBuffUI() {
    const bt = document.getElementById('buff-text');
    if (bt && dailyBuff) {
        if (dailyBuff.type === 'NONE') {
            bt.style.color = '#888';
            bt.style.textShadow = 'none';
        } else {
            bt.style.color = '#ffeb3b';
            bt.style.textShadow = '0 0 8px #ffeb3b';
        }
        bt.textContent = `🌟 本日の環境: ${dailyBuff.name}`;
    }
}

// 日次ミッションのリセットチェック
function checkDailyMissionsReset() {
    const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const lastDate = localStorage.getItem(DAILY_DATE_KEY);

    if (lastDate !== todayStr) {
        // 日付が変わったのでリセット
        localStorage.setItem(DAILY_DATE_KEY, todayStr);
        dailyMissions = { date: todayStr, playCount: 0, synthCount: 0, claimed: [false, false] }; // generateDailyMissionsの代わりに直接初期化
        generateDailyBuff(); // 新しい一日が始まった時にバフを抽選
        
        // 禁断ダンジョンのリセット
        forbiddenLastPlayed = '';
        localStorage.removeItem('hacsura_forbidden_date');
        
        saveData();
    }
    
    // 手動操作等の対策（フォールバック）
    if (forbiddenLastPlayed && forbiddenLastPlayed !== todayStr) {
        forbiddenLastPlayed = '';
        localStorage.removeItem('hacsura_forbidden_date');
    }

    // renderMissions(); // renderMissionsはupdateMissionUIに相当するため、後で呼び出す
    updateForbiddenUI();
}

// 禁断ダンジョンのUIボタン制御
function updateForbiddenUI() {
    const forbiddenBtn = document.getElementById('forbidden-dive-btn');
    if (!forbiddenBtn) return;
    const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    if (forbiddenLastPlayed === todayStr) {
        forbiddenBtn.disabled = true;
        forbiddenBtn.textContent = '💀 禁断ダンジョン (本日は挑戦済み)';
    } else {
        forbiddenBtn.disabled = false;
        forbiddenBtn.textContent = '💀 禁断ダンジョンに挑む (1日1回)';
    }
}

// ランキングデータのセーブ・ロード
function loadRanking() {
    const saved = localStorage.getItem(RANKING_KEY);
    if (saved) localRanking = JSON.parse(saved);
}
function saveRanking(score) {
    loadRanking();
    localRanking.push(score);
    localRanking.sort((a,b) => b - a); // 降順
    localRanking = localRanking.slice(0, 3); // トップ3
    localStorage.setItem(RANKING_KEY, JSON.stringify(localRanking));
}
function getCombatPower() {
    const atk = parseInt(statAtk.textContent) || 0;
    const def = parseInt(statDef.textContent) || 0;
    const crit = parseInt(statCrit.textContent.replace('%','')) || 0;
    return atk + def + (crit * 10);
}

// データの保存
function saveData() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ 
        inventory, 
        equipped,
        stamina,
        lastStaminaUpdate,
        combo,
        lastLoginDate,
        consecutiveLoginDays,
        dailyMissions,
        dailyBuff,
        forbiddenLastPlayed // 追加
    }));
}

// データの読み込み
function loadData() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            inventory = data.inventory || {};
            equipped = data.equipped || { weapon: null, armor: null, accessory: null };
            stamina = (data.stamina !== undefined) ? data.stamina : MAX_STAMINA;
            lastStaminaUpdate = data.lastStaminaUpdate || Date.now();
            combo = data.combo || 0;
            lastLoginDate = data.lastLoginDate || '';
            consecutiveLoginDays = data.consecutiveLoginDays || 0;
            dailyMissions = data.dailyMissions || { date: '', playCount: 0, synthCount: 0, claimed: [false, false] };
            dailyBuff = data.dailyBuff || null;
            forbiddenLastPlayed = data.forbiddenLastPlayed || ''; // 追加
        } catch (e) {
            console.error('Save data load error', e);
        }
    }
    
    // セーブデータにバフが存在しなければ生成して保存
    if (!dailyBuff) {
        generateDailyBuff();
        saveData();
    }
}

// コンボUIの更新
function updateComboUI() {
    if (!comboCountText) return;
    comboCountText.textContent = combo;
    if (combo >= 2) {
        comboDisplay.classList.add('combo-max');
        comboDisplay.innerHTML = `🔥 次回プレイでレア確率超絶UP！ (ボーナス確定)`;
    } else {
        comboDisplay.classList.remove('combo-max');
        comboDisplay.innerHTML = `🔥 連続プレイボーナス: <span id="combo-count">${combo}</span> / 3`;
    }
}

// 装備マスターデータ (type: weapon, armor, accessory)
const equipmentDB = [
    // --- N (ノーマル) ---
    { id: 'w1', name: '木の剣', type: 'weapon', rarity: 'N', atk: 5, def: 0, crit: 0 },
    { id: 'a1', name: '布の服', type: 'armor', rarity: 'N', atk: 0, def: 5, crit: 0 },
    { id: 'ac1', name: '鉄の指輪', type: 'accessory', rarity: 'N', atk: 2, def: 2, crit: 0 },
    { id: 'ac2', name: '力の指輪', type: 'accessory', rarity: 'R', atk: 10, def: 10, crit: 2 },
    { id: 'ac3', name: '闘神の指輪', type: 'accessory', rarity: 'SR', atk: 50, def: 50, crit: 5 },
    { id: 'ac4', name: '全能の指輪', type: 'accessory', rarity: 'SSR', atk: 200, def: 200, crit: 15 }
];

// ドロップ抽選機能
function generateDrop(isBonus) {
    const rand = Math.random() * 100;
    let rarity = 'N';
    
    if (isBonus) {
        // コンボボーナス中はバフより強力なSSR 20%, SR 50%を固定確率で使用
        if (rand < 20) rarity = 'SSR';
        else if (rand < 70) rarity = 'SR';
        else rarity = 'R';
    } else {
        // 通常確率（デイリー環境バフを適用）
        let ssrBoundary = (dailyBuff && dailyBuff.type === 'SSR_UP') ? 3 : 1;
        let srBoundary = ssrBoundary + ((dailyBuff && dailyBuff.type === 'SR_UP') ? 15 : 5);
        let rBoundary = srBoundary + 20;

        if (rand < ssrBoundary) rarity = 'SSR';
        else if (rand < srBoundary) rarity = 'SR';
        else if (rand < rBoundary) rarity = 'R';
    }

    const pool = equipmentDB.filter(e => e.rarity === rarity);
    const baseItem = pool[Math.floor(Math.random() * pool.length)];

    // 個体値（Quality）の抽選: 0.8倍 〜 1.5倍の範囲でランダムに変動
    // SSRは 1.1倍 〜 1.8倍 に補正して「外れ感」を減らす
    const minM = (rarity === 'SSR') ? 1.1 : 0.8;
    const maxM = (rarity === 'SSR') ? 1.8 : 1.5;
    const multiplier = minM + Math.random() * (maxM - minM);

    return {
        ...baseItem,
        quality: multiplier,
        atk: Math.round(baseItem.atk * multiplier),
        def: Math.round(baseItem.def * multiplier),
        crit: baseItem.crit // クリティカル率は固定（厳選しすぎを防ぐため）
    };
}

// ログ追加
function addLog(message) {
    const p = document.createElement('p');
    p.textContent = message;
    battleLog.appendChild(p);
    if (battleLog.children.length > 3) battleLog.removeChild(battleLog.firstChild);
}

// スタミナ更新処理
function updateStaminaUI() {
    staminaCountText.textContent = `${stamina}/${MAX_STAMINA}`;
    if (stamina <= 0) {
        diveBtn.disabled = true;
        diveBtn.textContent = '❌ スタミナ切れ（回復待ち）';
    } else if (!isBattling) {
        diveBtn.disabled = false;
        diveBtn.textContent = '⚔️ 潜る (スタミナ-1)';
    }
}

// スタミナ自然回復ループ処理
function checkStaminaRecovery() {
    if (stamina < MAX_STAMINA) {
        const now = Date.now();
        const diff = now - lastStaminaUpdate;
        if (diff >= STAMINA_RECOVERY_MS) {
            const recovery = Math.floor(diff / STAMINA_RECOVERY_MS);
            stamina = Math.min(MAX_STAMINA, stamina + recovery);
            lastStaminaUpdate = now - (diff % STAMINA_RECOVERY_MS);
            updateStaminaUI();
            saveData();
        }
    } else {
        lastStaminaUpdate = Date.now();
    }
}

// ステータス再計算とUI更新
function updateStatsUI() {
    let totalAtk = BASE_STATS.atk;
    let totalDef = BASE_STATS.def;
    let totalCrit = BASE_STATS.crit;

    ['weapon', 'armor', 'accessory'].forEach(type => {
        const itemId = equipped[type];
        if (itemId) {
            const base = equipmentDB.find(e => e.id === itemId);
            const inv = inventory[itemId];
            // 基礎値（個体値反映済） + レベルボーナス
            totalAtk += (inv.atk || base.atk) + (inv.level - 1) * 2;
            totalDef += (inv.def || base.def) + (inv.level - 1) * 2;
            totalCrit += base.crit;
        }
    });

    statAtk.textContent = totalAtk;
    statDef.textContent = totalDef;
    statCrit.textContent = `${totalCrit}%`;

    const updateEqSlot = (el, type, label) => {
        const itemId = equipped[type];
        if (itemId) {
            const item = equipmentDB.find(e => e.id === itemId);
            const level = inventory[itemId].level;
            const rInfo = getQualityRank(inventory[itemId].quality || 1.0);
            el.innerHTML = `${label}: ${item.name} Lv${level} <span class="${rInfo.class}">[${rInfo.rank}]</span>`;
            el.className = `eq-slot rarity-${item.rarity.toLowerCase()}`;
        } else {
            el.innerHTML = `${label}: なし`;
            el.className = 'eq-slot empty';
        }
    };
    
    updateEqSlot(eqWeapon, 'weapon', '武器');
    updateEqSlot(eqArmor, 'armor', '防具');
    updateEqSlot(eqAccessory, 'accessory', '装飾');
}

// 装備品獲得・合成処理
function processDrop(item) {
    let isNew = false;
    let level = 1;
    let statusText = '';

    if (inventory[item.id]) {
        // バフが「合成2倍」なら2レベルアップ
        const gain = (dailyBuff && dailyBuff.type === 'DOUBLE_SYNTH') ? 2 : 1;
        inventory[item.id].level += gain;
        level = inventory[item.id].level;
        
        // 個体値の厳選: 拾ったアイテムの方がATKかDEFが高ければ「更新」
        const oldAtk = inventory[item.id].atk || 0;
        const oldDef = inventory[item.id].def || 0;
        const oldQuality = inventory[item.id].quality || 1.0;
        
        if (item.atk > oldAtk || item.def > oldDef) {
            inventory[item.id].atk = Math.max(oldAtk, item.atk);
            inventory[item.id].def = Math.max(oldDef, item.def);
            inventory[item.id].quality = Math.max(oldQuality, item.quality);
            const r = getQualityRank(inventory[item.id].quality);
            statusText = `基礎ステ更新！ (${r.name})`;
        } else {
            const r = getQualityRank(oldQuality);
            statusText = `Lvアップ！ (既存維持: ${r.name})`;
        }
        
        dailyMissions.synthCount++; // ミッション：合成回数
    } else {
        inventory[item.id] = { 
            level: 1, 
            atk: item.atk, 
            def: item.def, 
            quality: item.quality 
        };
        isNew = true;
        const r = getQualityRank(item.quality);
        statusText = `新規獲得！ (${r.name})`;
        level = 1;
    }

    // 自動装備ロジック: 現在装備しているものより強ければ自動で上書き
    let isEquipped = false;
    const currentId = equipped[item.type];
    
    const getPower = (id) => {
        if (!id) return -1;
        const inv = inventory[id];
        const base = equipmentDB.find(e => e.id === id);
        const curAtk = (inv.atk || base.atk) + (inv.level - 1) * 2;
        const curDef = (inv.def || base.def) + (inv.level - 1) * 2;
        return curAtk + curDef;
    };

    const currentPower = getPower(currentId);
    const newPower = (inventory[item.id].atk) + (inventory[item.id].level - 1) * 2 + (inventory[item.id].def);

    if (newPower > currentPower) {
        equipped[item.type] = item.id;
        isEquipped = true;
    }

    updateStatsUI();
    saveData();
    return { isNew, level, isEquipped, statusText };
}

// SNSテキスト自動生成ロジック
function generateShareText(item) {
    const isSSR = item.rarity === 'SSR';
    
    // バズ狙いの複数パターンテキスト生成
    const patternsSSR = [
        `確率1%引いたんだが！？ww\nSSR「${item.name}」ドロップ！これバグってるだろｗ`,
        `完全に運使い果たしたわ...\n最高レアSSR「${item.name}」ゲット！`,
        `震えが止まらん。SSR「${item.name}」出たんだが！？`,
        `30秒で終わるゲームでSSR「${item.name}」一発ツモ！神引きすぎるｗ`
    ];
    
    const patternsSR = [
        `SR「${item.name}」をゲット！順調にインフレしてきた！`,
        `30秒ダンジョンでSR「${item.name}」ドロップ！なかなか良い引き！`,
        `装備枠がピカピカになってきたぜ。SR「${item.name}」獲得！`
    ];
    
    const pool = isSSR ? patternsSSR : patternsSR;
    const comment = pool[Math.floor(Math.random() * pool.length)];
    
    // 共通要素（URLとハッシュタグ）
    const appUrl = "https://example.com/"; // ※デプロイ後に本番URLに変更
    const hashtags = "#30秒ダンジョン #無限装備ガチャ";
    
    return `${comment}\n\n${hashtags}\n${appUrl}`;
}

// 将来の画像シェア拡張に向けたインターフェース
function shareToX(text, imageUrl = null) {
    const encodedText = encodeURIComponent(text);
    let url = `https://twitter.com/intent/tweet?text=${encodedText}`;
    
    // ※将来的に画像付きシェア（OGP動的生成やWeb Share API）を行う際の拡張枠
    if (imageUrl) {
        // 例: Web Intentsにパラメータとして画像を乗せる、等の実装をここに追加可能
        // url += `&url=${encodeURIComponent(imageUrl)}`;
    }
    // ポップアップウィンドウとして適切に開く
    window.open(url, '_blank', 'width=550,height=420');
}

// 結果表示画面の更新
function showResult(item, result) {
    dropRarity.textContent = item.rarity;
    
    // SSRテキストアニメーション制御
    if (item.rarity === 'SSR') {
        dropRarity.classList.add('ssr-text-animate');
    } else {
        dropRarity.classList.remove('ssr-text-animate');
    }

    // 画像の適用とエフェクト付与
    const dropImg = document.getElementById('drop-img');
    if (dropImg) {
        dropImg.src = `images/${item.type}.png`;
        dropImg.style.display = 'block';
        dropImg.className = `glow-${item.rarity.toLowerCase()}`;
    }
    
    let nameText = item.name;
    if (!result.isNew) nameText += ` Lv${result.level}`;
    dropName.textContent = nameText;
    
    let statusText = result.statusText;
    if (result.isEquipped && result.isNew) statusText += ' ➡ 自動装備';
    
    // 品質ランクのバッジ表示
    const dropQuality = document.getElementById('drop-quality');
    if (dropQuality) {
        const qRank = getQualityRank(item.quality);
        dropQuality.textContent = qRank.name;
        dropQuality.className = `quality-badge ${qRank.class}`;
        dropQuality.style.display = 'inline-block';
    }
    
    const existingStatus = document.getElementById('drop-status-text');
    if (existingStatus) existingStatus.remove();
    
    const p = document.createElement('p');
    p.id = 'drop-status-text';
    p.innerHTML = `${statusText}<br><span style="color:#aaa; font-size:0.8rem;">ATK: ${item.atk} / DEF: ${item.def}</span>`;
    p.style.color = '#ffb300';
    p.style.marginTop = '15px';
    p.style.fontWeight = 'bold';
    document.getElementById('drop-item').appendChild(p);
    
    dropRarity.className = ''; 
    dropRarity.classList.add(`rarity-${item.rarity.toLowerCase()}`);
    
    // SR以上ならX共有ボタンを表示
    if (shareXBtn) {
        if (item.rarity === 'SSR' || item.rarity === 'SR') {
            shareXBtn.classList.remove('hidden');
            
            // SSRの場合はボタンのデザインとテキストを強調
            if (item.rarity === 'SSR') {
                shareXBtn.classList.add('x-btn-ssr');
                shareXBtn.textContent = '🔥🔥 確率1%！自慢する！ 𝕏';
            } else {
                shareXBtn.classList.remove('x-btn-ssr');
                shareXBtn.textContent = '𝕏 ポストしてシェア';
            }

            // ワンタップ連携
            shareXBtn.onclick = () => {
                const text = generateShareText(item);
                // 画像URLを渡す場合は第2引数に入れる（現状はnull）
                shareToX(text, null); 
            };
        } else {
            shareXBtn.classList.add('hidden');
        }
    }
    
    resultOverlay.classList.remove('hidden');
}

// ダンジョン進行関数
async function startDungeon() {
    if (isBattling || stamina <= 0) return;
    
    // UI・ステータス制御
    isBattling = true;
    stamina -= 1;
    dailyMissions.playCount++; // ミッション：プレイ回数
    
    // コンボ処理
    combo++;
    let isBonus = false;
    if (combo >= 3) {
        isBonus = true;
    }
    updateComboUI();
    saveData();
    updateStaminaUI();
    
    diveBtn.disabled = true;
    diveBtn.textContent = '探索中...';
    character.classList.add('anim-attack');
    gameContainer.classList.add('shake'); // 画面揺れ演出
    battleLog.innerHTML = '';
    
    addLog('▶ ダンジョンに突入した！');
    await new Promise(r => setTimeout(r, 600));
    addLog('▶ モンスターの群れと交戦中...!!');
    await new Promise(r => setTimeout(r, 600));
    addLog('▶ ボスを撃破した！宝箱を発見！');
    await new Promise(r => setTimeout(r, 600));
    
    if (isBonus) addLog('★ コンボボーナス！高レア確定宝箱！ ★');

    // 抽選と処理
    const item = generateDrop(isBonus);
    const result = processDrop(item);

    // ボーナスだった場合は次回に向けてコンボリセット
    if (isBonus) {
        combo = 0; 
        updateComboUI();
    }

    // SSR演出のタメとフラッシュ
    if (item.rarity === 'SSR') {
        character.classList.remove('anim-attack');
        gameContainer.classList.remove('shake');
        addLog('▶ 宝箱が...異常な光を放っている...！？');
        
        // 1.5秒のタメ
        await new Promise(r => setTimeout(r, 1500));
        
        // 画面フラッシュ生成
        const flash = document.createElement('div');
        flash.className = 'ssr-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 1500); // アニメーション終了後に削除
    }

    // 戦闘終了
    isBattling = false;
    character.classList.remove('anim-attack');
    gameContainer.classList.remove('shake');
    updateStaminaUI(); // ボタンのテキストと状態を戻す

    showResult(item, result);
}

// 広告（Monetag Direct Link）再生処理
const MONETAG_DIRECT_LINK = 'https://omg10.com/4/10783828';

if (adBtn) {
    adBtn.addEventListener('click', () => {
        if (stamina >= MAX_STAMINA) {
            alert('スタミナは満タンです！');
            return;
        }
        
        if (confirm('スポンサーのページ（広告）を別タブで開きます。\nサイトを数秒見た後、このゲームの画面に戻ってくるとスタミナが全回復します！')) {
            const openTime = Date.now();
            window.open(MONETAG_DIRECT_LINK, '_blank');
            
            // 戻ってきたら回復させる処理
            const onReturn = () => {
                if (document.hidden) return; // バックグラウンド時は無視
                
                const returnTime = Date.now();
                if (returnTime - openTime > 3000) { // 3秒以上経過で成功
                    stamina = MAX_STAMINA;
                    lastStaminaUpdate = Date.now();
                    updateStaminaUI();
                    saveData();
                    alert('スポンサーサイトの閲覧ありがとうございます！\nスタミナが全回復しました！');
                } else {
                    alert('閲覧時間が短すぎたため回復できませんでした。\nもう少し長く見てからお戻りください。');
                }
                
                // イベントリスナーを解除
                document.removeEventListener('visibilitychange', onReturn);
                window.removeEventListener('focus', onReturn);
            };

            // 直後に発火するのを防ぐため、1秒後に検知を開始
            setTimeout(() => {
                document.addEventListener('visibilitychange', onReturn);
                window.addEventListener('focus', onReturn);
            }, 1000);
        }
    });
}

// リセット処理の最終実行
function finalizeReset() {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(DAILY_DATE_KEY); // 追加
    localStorage.removeItem('hacsura_forbidden_date'); // 追加
    location.reload();
}

// リセットボタン
const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        const cp = getCombatPower();
        if (confirm(`現在の戦闘力は「${cp}」です。\nデータを初期化して最初からやり直しますか？`)) {
            // ローカルランキングに保存
            saveRanking(cp);
            finalizeReset();
        }
    });
}

// オンラインスコア送信アクション (ランキングタブ内)
const submitScoreBtn = document.getElementById('submit-score-btn');

if (submitScoreBtn) {
    submitScoreBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('player-name-input');
        const name = nameInput.value.trim() || '名無しの冒険者';
        const cp = getCombatPower();
        
        const originalText = submitScoreBtn.textContent;
        submitScoreBtn.disabled = true;
        submitScoreBtn.textContent = '送信中...';
        
        try {
            const res = await fetch('/api/ranking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, score: cp })
            });
            if (res.ok) {
                alert('オンラインランキングに登録しました！');
                renderRanking(); // 送信成功後にリスト更新
            } else {
                throw new Error('API Error');
            }
        } catch (e) {
            console.error(e);
            alert('送信失敗 (Vercel KV連携未完了の可能性があります)');
        }
        
        submitScoreBtn.disabled = false;
        submitScoreBtn.textContent = originalText;
    });
}

// ランキング表示処理
const rankingBtn = document.getElementById('ranking-btn');
const closeRankingBtn = document.getElementById('close-ranking-btn');
const tabLocal = document.getElementById('tab-local');
const tabOnline = document.getElementById('tab-online');

let currentRankingTab = 'local';

async function renderRanking() {
    const list = document.getElementById('ranking-list');
    const submitArea = document.getElementById('online-submit-area');
    list.innerHTML = '<li style="color:#aaa; text-align:center;">読み込み中...</li>';

    if (currentRankingTab === 'local') {
        if (submitArea) submitArea.classList.add('hidden');
        loadRanking();
        list.innerHTML = '';
        if (!localRanking || localRanking.length === 0) {
            list.innerHTML = '<li style="color:#888; text-align:center;">記録なし</li>';
        } else {
            for (let i = 0; i < Math.min(3, localRanking.length); i++) {
                const score = localRanking[i] || 0;
                const li = document.createElement('li');
                li.textContent = `${i+1}位: 戦闘力 ${score}`;
                list.appendChild(li);
            }
        }
    } else {
        // オンライン
        if (submitArea) {
            document.getElementById('current-score-val').textContent = getCombatPower();
            submitArea.classList.remove('hidden');
        }
        try {
            const res = await fetch('/api/ranking');
            if (!res.ok) throw new Error('API Error');
            const data = await res.json();
            
            list.innerHTML = '';
            if (!data || data.length === 0) {
                list.innerHTML = '<li style="color:#888; text-align:center;">まだ記録がありません</li>';
            } else {
                for (let i = 0; i < data.length; i++) {
                    const li = document.createElement('li');
                    li.textContent = `${i+1}位: ${data[i].name} (${data[i].score})`;
                    list.appendChild(li);
                }
            }
        } catch (e) {
            console.error(e);
            list.innerHTML = '<li style="color:#ff5252; font-size:0.9rem; text-align:center;">通信エラー<br><span style="font-size:0.75rem;">(Vercel KVの連携が必要です)</span></li>';
        }
    }
}

if (rankingBtn) {
    rankingBtn.addEventListener('click', () => {
        document.getElementById('ranking-overlay').classList.remove('hidden');
        renderRanking();
    });
}

if (closeRankingBtn) {
    closeRankingBtn.addEventListener('click', () => {
        document.getElementById('ranking-overlay').classList.add('hidden');
    });
}

if (tabLocal && tabOnline) {
    tabLocal.addEventListener('click', () => {
        currentRankingTab = 'local';
        tabLocal.classList.add('active-tab');
        tabOnline.classList.remove('active-tab');
        renderRanking();
    });
    tabOnline.addEventListener('click', () => {
        currentRankingTab = 'online';
        tabOnline.classList.add('active-tab');
        tabLocal.classList.remove('active-tab');
        renderRanking();
    });
}

function startForbiddenDungeon() {
    if (isBattling) return;

    isBattling = true;
    character.classList.add('anim-attack');
    gameContainer.classList.add('shake');
    
    const fBtn = document.getElementById('forbidden-dive-btn');
    fBtn.disabled = true;
    fBtn.textContent = '😈 禁断の地を探索中...';
    
    battleLog.innerHTML = '<p>▶ <span style="color:#ff5252;">禍々しいオーラを感じる...</span></p>';
    
    setTimeout(() => {
        battleLog.innerHTML += '<p>▶ <span style="font-weight:bold; font-size:1.1rem; color:#ff1744;">凶悪なボスが立ち塞がった！！</span></p>';
    }, 1500);

    setTimeout(() => {
        // 勝敗判定 (勝率30〜50%。プレイヤーの戦闘力に応じて変動)
        const cp = getCombatPower();
        // ベース25%、戦闘力が高いほど最大50%に近づく（戦闘力5000で+25%）
        let winRate = 0.25 + Math.min(0.25, (cp || 0) / 5000); 
        const isWin = Math.random() < winRate;

        isBattling = false;
        character.classList.remove('anim-attack');
        gameContainer.classList.remove('shake');
        
        fBtn.textContent = '💀 禁断ダンジョン (本日は挑戦済み)';
        
        if (isWin) {
            // 勝利処理
            battleLog.innerHTML += '<p style="color:#ffb300; font-weight:bold;">▶ 激闘の末、ボスを打ち倒した！！！</p>';
            const result = processForbiddenDrop();
            showResult(result.item, result);
        } else {
            // 敗北処理
            battleLog.innerHTML += '<p style="color:#ff5252;">▶ ボスの圧倒的な力の前に敗北した...</p>';
            processForbiddenDefeat();
        }
    }, 4000); // 通常より少し長い4秒の戦闘
}

function processForbiddenDrop() {
    // 0.1%の確率でUR確定
    const isUR = Math.random() < 0.001;
    let pool = [];
    
    if (isUR) {
        pool = equipmentDB.filter(e => e.rarity === 'UR');
    } else {
        pool = equipmentDB.filter(e => e.rarity === 'SSR');
    }
    
    const baseItem = pool[Math.floor(Math.random() * pool.length)];
    
    // 品質は禁断専用に非常に高い（1.3倍〜2.0倍）
    const multiplier = 1.3 + Math.random() * 0.7;
    const droppedItem = {
        ...baseItem,
        quality: multiplier,
        atk: Math.round(baseItem.atk * multiplier),
        def: Math.round(baseItem.def * multiplier),
        crit: baseItem.crit
    };
    
    let isNew = false;
    let isEquipped = false;
    let statusText = '';
    
    if (inventory[droppedItem.id]) {
        // 既存装備の場合は合成レベルアップ
        inventory[droppedItem.id].level += 1;
        
        const oldAtk = inventory[droppedItem.id].atk || 0;
        const oldDef = inventory[droppedItem.id].def || 0;
        const oldQuality = inventory[droppedItem.id].quality || 1.0;
        
        if (droppedItem.atk > oldAtk || droppedItem.def > oldDef) {
            inventory[droppedItem.id].atk = Math.max(oldAtk, droppedItem.atk);
            inventory[droppedItem.id].def = Math.max(oldDef, droppedItem.def);
            inventory[droppedItem.id].quality = Math.max(oldQuality, droppedItem.quality);
            statusText = `合成大成功！Lv${inventory[droppedItem.id].level} (ステータス超絶更新!)`;
        } else {
            statusText = `合成成功！Lv${inventory[droppedItem.id].level}`;
        }
        
    } else {
        // 新規取得
        inventory[droppedItem.id] = { 
            level: 1, 
            atk: droppedItem.atk, 
            def: droppedItem.def, 
            quality: droppedItem.quality 
        };
        isNew = true;
        statusText = 'NEW!';
    }
    
    // 自動装備処理
    const eqTarget = equipped[droppedItem.type];
    if (!eqTarget) {
        equipped[droppedItem.type] = droppedItem.id;
        isEquipped = true;
    } else {
        const currentItem = equipmentDB.find(e => e.id === eqTarget);
        const currentRarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[currentItem.rarity];
        const newRarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[droppedItem.rarity];
        if (newRarityScore > currentRarityScore) {
            equipped[droppedItem.type] = droppedItem.id;
            isEquipped = true;
        }
    }
    
    saveData();
    updateStatsUI();
    
    return {
        item: droppedItem,
        isNew: isNew,
        isEquipped: isEquipped,
        statusText: statusText
    };
}

function processForbiddenDefeat() {
    const equippedItemIds = [equipped.weapon, equipped.armor, equipped.accessory].filter(id => id !== null);
    
    if (equippedItemIds.length === 0) {
        alert('【禁断ダンジョン敗北】\nボスの猛攻を受けたが、失う装備がなかったため命拾いした...！');
        return;
    }
    
    if (equippedItemIds.length === 1) {
        alert('【禁断ダンジョン敗北】\nボスの情けにより、たった一つの装備のロストは免れた...！');
        return;
    }

    // 最強装備を1つ選定して保護（スコア算出）
    let strongestId = null;
    let maxScore = -1;
    
    equippedItemIds.forEach(id => {
        const inv = inventory[id];
        const base = equipmentDB.find(e => e.id === id) || { rarity: 'N' };
        const rarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[base.rarity] || 1;
        const score = (inv.atk || 0) + (inv.def || 0) + ((inv.level || 1) * 10) + (rarityScore * 100);
        if (score > maxScore) {
            maxScore = score;
            strongestId = id;
        }
    });
    
    // 最強装備を除外したリストからランダムでロスト
    const lostCandidates = equippedItemIds.filter(id => id !== strongestId);
    const lostId = lostCandidates[Math.floor(Math.random() * lostCandidates.length)];
    const lostBase = equipmentDB.find(e => e.id === lostId) || { name: '不明な装備', type: 'weapon' };
    
    // ロスト実行
    delete inventory[lostId];
    equipped[lostBase.type] = null;
    
    saveData();
    updateStatsUI();
    
    // ロスト画面フラッシュ演出
    const flash = document.createElement('div');
    flash.style.position = 'absolute';
    flash.style.top = '0'; flash.style.left = '0'; flash.style.right = '0'; flash.style.bottom = '0';
    flash.style.backgroundColor = 'rgba(255, 0, 0, 0.8)';
    flash.style.zIndex = '9999';
    flash.style.pointerEvents = 'none';
    flash.style.transition = 'opacity 2s ease-out';
    document.body.appendChild(flash);
    setTimeout(() => {
        flash.style.opacity = '0';
        setTimeout(() => flash.remove(), 2000);
    }, 100);
    
    // 敗北用リザルト画面の表示
    const resultOverlay = document.getElementById('result-overlay');
    resultOverlay.querySelector('h2').textContent = '【大敗北】';
    resultOverlay.querySelector('h2').style.color = '#ff5252';
    
    document.getElementById('drop-rarity').textContent = 'LOST';
    document.getElementById('drop-rarity').className = 'rarity-ur';
    document.getElementById('drop-name').innerHTML = `ボスの圧倒的な力により<br><span style="color:#ff5252; font-size:1.5rem; margin-top:10px; display:inline-block;">${lostBase.name}</span><br>が破壊された...`;
    
    const dropQuality = document.getElementById('drop-quality');
    if (dropQuality) dropQuality.style.display = 'none';

    const existingStatus = document.getElementById('drop-status-text');
    if (existingStatus) existingStatus.remove();

    const shareXBtn = document.getElementById('share-x-btn');
    if (shareXBtn) {
        shareXBtn.classList.remove('hidden');
        shareXBtn.dataset.type = 'forbidden_loss';
        shareXBtn.dataset.itemName = lostBase.name;
    }
    
    resultOverlay.classList.remove('hidden');
}

// 禁断ダンジョン開始ロジック（イベントリスナー）
const forbiddenBtn = document.getElementById('forbidden-dive-btn');
if (forbiddenBtn) {
    forbiddenBtn.addEventListener('click', () => {
        const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
        if (forbiddenLastPlayed === todayStr) {
            alert('本日の挑戦は終了しています。また明日挑戦してください。');
            return;
        }
        
        if (isBattling) return;
        
        const confirmMsg = "【警告：禁断ダンジョン】\n" +
                           "通常の何倍も強力な敵が出現します。\n" +
                           "勝利すればSSR確定＋超レア装備のチャンスがありますが、\n" +
                           "敗北すると「現在装備しているアイテムをランダムに1つ失う」強烈なペナルティがあります。\n\n" +
                           "本当に挑戦しますか？";
                           
        if (confirm(confirmMsg)) {
            // 回数消費を記録して戦闘開始
            forbiddenLastPlayed = todayStr;
            localStorage.setItem('hacsura_forbidden_date', forbiddenLastPlayed);
            updateForbiddenUI();
            saveData();
            
            startForbiddenDungeon();
        }
    });
}

// Xシェアボタンの処理
if (shareXBtn) {
    shareXBtn.addEventListener('click', () => {
        let text = '';
        const type = shareXBtn.dataset.type;
        const itemName = shareXBtn.dataset.itemName;
        const rank = shareXBtn.dataset.rank;

        if (type === 'forbidden_loss') {
            text = `【禁断の領域で大敗北...】\n強敵に敗れ「${itemName}」を失った...\n誰か俺の仇を討ってくれ...！！\n#30秒ダンジョン #ハクスラ`;
        } else {
            text = `【神引き！】\n「${itemName}」(${rank})をゲット！\n無限装備ガチャで最強を目指す！\n#30秒ダンジョン #ハクスラ`;
        }
        
        const url = encodeURIComponent('https://my-vercel-app-4ogr.vercel.app/');
        const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${url}`;
        window.open(shareUrl, '_blank');
    });
}

// 初期化とタイマー
loadData();   
loadRanking();   
checkDailyMissionsReset(); // 追加
updateStatsUI(); 
updateStaminaUI();
updateComboUI();
updateBuffUI(); // 追加
checkLoginBonus(); // ログインボーナスの確認と発火
updateForbiddenUI(); // 禁断ダンジョンUIの初期化
setInterval(checkStaminaRecovery, 1000); // 毎秒スタミナ回復確認

// イベントリスナー
diveBtn.addEventListener('click', startDungeon);
closeResultBtn.addEventListener('click', () => {
    resultOverlay.classList.add('hidden');
    addLog('▶ 次の探索の準備ができました。');
});

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.log('SW registration failed:', err));
    });
}

// 日数差分計算ヘルパー
function getDaysDiff(dateStr1, dateStr2) {
    if (!dateStr1 || !dateStr2) return -1;
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    d1.setHours(0,0,0,0);
    d2.setHours(0,0,0,0);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

// ログインボーナスチェック
function checkLoginBonus() {
    const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    
    if (lastLoginDate !== today) {
        // 連続ログイン日数の計算
        if (!lastLoginDate) {
            consecutiveLoginDays = 1;
        } else {
            const diff = getDaysDiff(lastLoginDate, today);
            if (diff === 1) {
                consecutiveLoginDays++;
            } else if (diff > 1 || diff < 0) {
                consecutiveLoginDays = 1; // 途切れた場合は1日目に戻る
            }
        }
        lastLoginDate = today;
        
        const is7thDay = (consecutiveLoginDays % 7 === 0);
        
        // 報酬①: スタミナ回復（7日目は上限突破で+20確定）
        if (is7thDay) {
            stamina += 20; 
        } else {
            stamina = Math.max(stamina, MAX_STAMINA);
        }
        
        // 報酬②: 装備ドロップ（7日目は無条件でSSRプールから排出）
        let bonusItem;
        if (is7thDay) {
            const ssrPool = equipmentDB.filter(e => e.rarity === 'SSR');
            bonusItem = ssrPool[Math.floor(Math.random() * ssrPool.length)];
        } else {
            bonusItem = generateDrop(true); 
        }
        const result = processDrop(bonusItem);
        
        // UI表示生成
        const lbOverlay = document.getElementById('login-bonus-overlay');
        const lbItemArea = document.getElementById('login-bonus-item');
        
        if (lbOverlay && lbItemArea) {
            const lbDesc = document.querySelector('#login-bonus-content p');
            const dayTitle = is7thDay 
                ? `<h3 style="color:#ff5252; text-shadow:0 0 10px #ff5252; margin:0 0 10px 0; font-size:1.4rem;">🎉 7日連続ログイン達成！ 🎉</h3>` 
                : `<h3 style="color:#4fc3f7; margin:0 0 10px 0;">連続ログイン: ${consecutiveLoginDays}日目</h3>`;
            
            if (is7thDay) {
                lbDesc.innerHTML = `いつもプレイありがとうございます！<br>スタミナが <strong>20</strong> 回復し、<strong style="color:#ff5252;">最高レアSSRが確定</strong>しました！`;
            } else {
                lbDesc.innerHTML = `本日のログインありがとうございます！<br>スタミナが満タンになりました！`;
            }

            lbItemArea.innerHTML = `
                ${dayTitle}
                <div style="font-size:0.9rem; color:#aaa; margin-bottom:10px;">本日の特別配給</div>
                <img src="images/${bonusItem.type}.png" class="glow-${bonusItem.rarity.toLowerCase()}" style="width:80px; height:80px; border-radius:10px; object-fit:cover; margin:0 auto; display:block;">
                <div style="font-size:1.2rem; font-weight:bold; margin-top:10px;" class="rarity-${bonusItem.rarity.toLowerCase()}">${bonusItem.name}</div>
            `;
            lbOverlay.classList.remove('hidden');
        }
        
        saveData();
        updateStaminaUI();
    }
}

const closeLoginBonusBtn = document.getElementById('close-login-bonus-btn');
if (closeLoginBonusBtn) {
    closeLoginBonusBtn.addEventListener('click', () => {
        document.getElementById('login-bonus-overlay').classList.add('hidden');
    });
}

// デイリーミッションUI処理
const missionBtn = document.getElementById('mission-btn');
const closeMissionBtn = document.getElementById('close-mission-btn');
const missionOverlay = document.getElementById('mission-overlay');

function updateMissionUI() {
    const list = document.getElementById('mission-list');
    if (!list) return;
    list.innerHTML = '';
    
    const missions = [
        { desc: 'ダンジョンに3回潜る', target: 3, curr: dailyMissions.playCount, reward: 'スタミナ+5', type: 'stamina', val: 5 },
        { desc: '装備を1回合成(限界突破)', target: 1, curr: dailyMissions.synthCount, reward: 'SR以上確定', type: 'drop', val: true }
    ];
    
    missions.forEach((m, idx) => {
        const li = document.createElement('li');
        li.className = 'mission-item';
        
        const progress = Math.min(m.curr, m.target);
        const isClear = progress >= m.target;
        const isClaimed = dailyMissions.claimed[idx];
        
        let btnHtml = '';
        if (isClaimed) {
             btnHtml = `<button class="btn secondary" disabled style="background:#555;">受取済</button>`;
        } else if (isClear) {
             btnHtml = `<button class="btn primary" onclick="claimMission(${idx}, '${m.type}', ${m.val})">受取</button>`;
        } else {
             btnHtml = `<span style="font-size:0.8rem; color:#aaa;">${progress}/${m.target}</span>`;
        }
        
        li.innerHTML = `
            <div style="text-align:left; flex:1;">
                <div style="font-size:0.9rem;">${m.desc}</div>
                <div style="font-size:0.8rem; color:#ffb300;">報酬: ${m.reward}</div>
            </div>
            <div style="min-width:60px; text-align:right;">${btnHtml}</div>
        `;
        list.appendChild(li);
    });
}

// グローバル関数として報酬受取処理を定義
window.claimMission = function(idx, type, val) {
    if (dailyMissions.claimed[idx]) return;
    
    dailyMissions.claimed[idx] = true;
    
    if (type === 'stamina') {
        stamina = stamina + val; // 上限突破（オーバーフロー回復）を許可
        updateStaminaUI();
        alert(`ミッション達成！スタミナが${val}回復しました！`);
    } else if (type === 'drop') {
        alert('ミッション達成！高レア確定宝箱を開けます！');
        const bonusItem = generateDrop(true); 
        const result = processDrop(bonusItem);
        showResult(bonusItem, result);
    }
    
    updateMissionUI();
    saveData();
};

if (missionBtn) {
    missionBtn.addEventListener('click', () => {
        updateMissionUI();
        missionOverlay.classList.remove('hidden');
    });
}
if (closeMissionBtn) {
    closeMissionBtn.addEventListener('click', () => {
        missionOverlay.classList.add('hidden');
    });
}
