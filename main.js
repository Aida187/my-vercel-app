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

// セーブデータ（状態管理）
let inventory = {}; 
let equipped = { weapon: null, armor: null, accessory: null };
let isBattling = false;
let stamina = MAX_STAMINA;
let lastStaminaUpdate = Date.now();
let combo = 0;
let lastLoginDate = '';
let consecutiveLoginDays = 0;
const RANKING_KEY = 'hacsura_local_ranking';
let localRanking = [];
let dailyMissions = { date: '', playCount: 0, synthCount: 0, claimed: [false, false] };
let dailyBuff = null;

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
    const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
    if (dailyMissions.date !== today) {
        dailyMissions = { date: today, playCount: 0, synthCount: 0, claimed: [false, false] };
        generateDailyBuff(); // 新しい一日が始まった時にバフを抽選
        saveData();
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
        dailyBuff
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
    { id: 'w1', name: '木の剣', type: 'weapon', rarity: 'N', atk: 5, def: 0, crit: 0 },
    { id: 'w2', name: '鋼の剣', type: 'weapon', rarity: 'R', atk: 20, def: 0, crit: 0 },
    { id: 'w3', name: 'ミスリルソード', type: 'weapon', rarity: 'SR', atk: 100, def: 0, crit: 0 },
    { id: 'w4', name: 'エクスカリバー', type: 'weapon', rarity: 'SSR', atk: 500, def: 0, crit: 0 },
    { id: 'a1', name: '布の服', type: 'armor', rarity: 'N', atk: 0, def: 5, crit: 0 },
    { id: 'a2', name: '革の鎧', type: 'armor', rarity: 'R', atk: 0, def: 20, crit: 0 },
    { id: 'a3', name: '魔法の鎧', type: 'armor', rarity: 'SR', atk: 0, def: 100, crit: 0 },
    { id: 'a4', name: '神竜の鎧', type: 'armor', rarity: 'SSR', atk: 0, def: 500, crit: 0 },
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
    return pool[Math.floor(Math.random() * pool.length)];
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
            const item = equipmentDB.find(e => e.id === itemId);
            const level = inventory[itemId].level;
            totalAtk += item.atk * level;
            totalDef += item.def * level;
            totalCrit += item.crit * level;
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
            el.textContent = `${label}: ${item.name} Lv${level}`;
            el.className = `eq-slot rarity-${item.rarity.toLowerCase()}`;
        } else {
            el.textContent = `${label}: なし`;
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

    if (inventory[item.id]) {
        // バフが「合成2倍」なら2レベルアップ
        const gain = (dailyBuff && dailyBuff.type === 'DOUBLE_SYNTH') ? 2 : 1;
        inventory[item.id].level += gain;
        level = inventory[item.id].level;
        dailyMissions.synthCount++; // ミッション：合成回数
    } else {
        inventory[item.id] = { level: 1 };
        isNew = true;
    }

    const currentEqId = equipped[item.type];
    const itemScore = (item.atk + item.def + item.crit) * level;
    
    let isEquipped = false;
    if (!currentEqId) {
        equipped[item.type] = item.id;
        isEquipped = true;
    } else {
        const currentEq = equipmentDB.find(e => e.id === currentEqId);
        const currentLevel = inventory[currentEqId].level;
        const currentScore = (currentEq.atk + currentEq.def + currentEq.crit) * currentLevel;
        if (itemScore > currentScore || currentEqId === item.id) {
            equipped[item.type] = item.id;
            isEquipped = true;
        }
    }

    updateStatsUI();
    saveData();
    return { isNew, level, isEquipped };
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
    
    let statusText = result.isNew ? '✨ 新規獲得！' : '🔄 合成（レベルアップ）！';
    if (result.isEquipped && result.isNew) statusText += ' ➡ 自動装備しました';
    
    const existingStatus = document.getElementById('drop-status-text');
    if (existingStatus) existingStatus.remove();
    
    const p = document.createElement('p');
    p.id = 'drop-status-text';
    p.textContent = statusText;
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

// 本格的な動画広告モックのクリック処理
if (adBtn) {
    adBtn.addEventListener('click', () => {
        if (stamina >= MAX_STAMINA) {
            alert('スタミナは満タンです！');
            return;
        }
        
        adOverlay.classList.remove('hidden');
        adCloseBtn.classList.add('hidden');
        adVideo.currentTime = 0;
        adVideo.play().catch(e => console.error("Video play error", e));
        
        let timeLeft = 5;
        adTimerText.textContent = `残り ${timeLeft} 秒`;
        
        adTimerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(adTimerInterval);
                adTimerText.textContent = '報酬獲得！';
                adCloseBtn.classList.remove('hidden');
            } else {
                adTimerText.textContent = `残り ${timeLeft} 秒`;
            }
        }, 1000);
    });
}

if (adCloseBtn) {
    adCloseBtn.addEventListener('click', () => {
        adVideo.pause();
        adOverlay.classList.add('hidden');
        
        stamina = MAX_STAMINA;
        lastStaminaUpdate = Date.now();
        updateStaminaUI();
        saveData();
    });
}

// リセットボタン（ランキング登録含む）
const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        const cp = getCombatPower();
        if (confirm(`現在の戦闘力は「${cp}」です。\n今回の記録を殿堂入りランキングに保存し、データを初期化して最初からやり直しますか？`)) {
            saveRanking(cp);
            localStorage.removeItem(SAVE_KEY);
            location.reload();
        }
    });
}

// ランキング表示処理
const rankingBtn = document.getElementById('ranking-btn');
const closeRankingBtn = document.getElementById('close-ranking-btn');

if (rankingBtn) {
    rankingBtn.addEventListener('click', () => {
        loadRanking();
        const list = document.getElementById('ranking-list');
        list.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const score = localRanking[i] || 0;
            const li = document.createElement('li');
            li.textContent = `${i+1}位: 戦闘力 ${score}`;
            list.appendChild(li);
        }
        document.getElementById('ranking-overlay').classList.remove('hidden');
    });
}
if (closeRankingBtn) {
    closeRankingBtn.addEventListener('click', () => {
        document.getElementById('ranking-overlay').classList.add('hidden');
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
