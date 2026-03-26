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
const STAMINA_RECOVERY_MS = 300000; // 5分で1回復
const SAVE_KEY = 'hacsura_save_data';
const DAILY_DATE_KEY = 'hacsura_daily_date'; // 追加: ミッションリセット用のキー
const EVO_COST = 5; // 追加: 合成に必要な数
const EVO_LEVEL_INHERIT_RATE = 0.3; // 追加: レベル引き継ぎ率
const EVO_MANA_COSTS = { 'N': 20, 'R': 100, 'SR': 600 }; // 追加: 合成に必要なマナ

// --- 追加: エンチャント定義 ---
const ENCHANTMENTS = [
    { id: 'recovery', name: '再来の魂', desc: 'スタミナ回復速度1.3倍', val: 1.3 },
    { id: 'luck', name: '幸運の魂', desc: 'SSRドロップ率1.2倍', val: 1.2 },
    { id: 'power', name: '剛力の魂', desc: '攻撃ダメージ1.2倍', val: 1.2 },
    { id: 'vampire', name: '吸血の魂', desc: '勝利時スタミナ稀に1回復', val: 0.1 }
];

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
let equippedEnchants = { weapon: null, armor: null, accessory: null };
// 各種フラグ・状態
let stamina = MAX_STAMINA;
let materials = 0; // 追加
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
let offeringBuff = null; // 供物バフ { rarity, power, expiresAt }
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

// バフのUI更新
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

    const obt = document.getElementById('offering-buff-text');
    if (obt) {
        const now = Date.now();
        if (offeringBuff && offeringBuff.expiresAt > now) {
            obt.style.display = 'inline-block';
            const powerPct = (offeringBuff.power * 100).toFixed(0);
            const remainSec = Math.floor((offeringBuff.expiresAt - now) / 1000);
            const m = Math.floor(remainSec / 60);
            const s = remainSec % 60;
            obt.textContent = `🙏 供物の祈り: SSR率+${powerPct}% (残り ${m}:${s.toString().padStart(2,'0')})`;
        } else {
            obt.style.display = 'none';
        }
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
    try {
        const saved = localStorage.getItem(RANKING_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                localRanking = parsed;
            } else {
                localRanking = [];
            }
        }
    } catch (e) {
        console.error("Ranking Load Error:", e);
        localRanking = [];
    }
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
    
    // 剛力の魂（ダメージUP）の適用
    let multiplier = 1.0;
    Object.values(equippedEnchants).forEach(e => {
        if (e && e.id === 'power') multiplier *= e.val;
    });

    return Math.round((atk + def + (crit * 10)) * multiplier);
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
        offeringBuff,
        forbiddenLastPlayed,
        equippedEnchants, // 追加
        materials // 追加
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
            offeringBuff = data.offeringBuff || null;
            forbiddenLastPlayed = data.forbiddenLastPlayed || '';
            equippedEnchants = data.equippedEnchants || { weapon: null, armor: null, accessory: null }; 
            materials = data.materials || 0; // 追加
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
    if (!comboCountText || !comboDisplay) return;
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
    { id: 'w2', name: '錆びた剣', type: 'weapon', rarity: 'N', atk: 3, def: 0, crit: 0 },
    { id: 'a1', name: '布の服', type: 'armor', rarity: 'N', atk: 0, def: 5, crit: 0 },
    { id: 'a2', name: 'ぼろぼろの服', type: 'armor', rarity: 'N', atk: 0, def: 3, crit: 0 },
    { id: 'ac1', name: '石の指輪', type: 'accessory', rarity: 'N', atk: 2, def: 2, crit: 0 },
    // --- R (レア) ---
    { id: 'w3', name: '鉄の剣', type: 'weapon', rarity: 'R', atk: 15, def: 0, crit: 1 },
    { id: 'a3', name: '皮の鎧', type: 'armor', rarity: 'R', atk: 0, def: 15, crit: 0 },
    { id: 'ac2', name: '力の指輪', type: 'accessory', rarity: 'R', atk: 10, def: 10, crit: 2 },
    // --- SR (スーパーレア) ---
    { id: 'w4', name: '銀の剣', type: 'weapon', rarity: 'SR', atk: 40, def: 0, crit: 3 },
    { id: 'a4', name: '鋼の鎧', type: 'armor', rarity: 'SR', atk: 0, def: 40, crit: 2 },
    { id: 'ac3', name: '闘神の指輪', type: 'accessory', rarity: 'SR', atk: 50, def: 50, crit: 5 },
    // --- SSR (超絶レア) ---
    { id: 'w5', name: '聖剣エクスカリバー', type: 'weapon', rarity: 'SSR', atk: 150, def: 20, crit: 10 },
    { id: 'w6', name: '魔剣レヴァテイン', type: 'weapon', rarity: 'SSR', atk: 180, def: 0, crit: 15 },
    { id: 'a5', name: '神盾イージス', type: 'armor', rarity: 'SSR', atk: 20, def: 150, crit: 5 },
    { id: 'a6', name: '光輝の鎧', type: 'armor', rarity: 'SSR', atk: 50, def: 100, crit: 5 },
    { id: 'ac4', name: '全能の指輪', type: 'accessory', rarity: 'SSR', atk: 200, def: 200, crit: 15 }
];

// ドロップ抽選機能
function generateDrop(isBonus) {
    const rand = Math.random() * 100;
    let rarity = 'N';
    
    // エンチャント抽選 (15%の確率で付与。SSR/URならさらに高確率)
    let enchant = null;
    const enchantChance = 0.15; // 基本15%
    
    if (isBonus) {
        // コンボボーナス中はバフより強力なSSR 20%, SR 50%を固定確率で使用
        if (rand < 20) rarity = 'SSR';
        else if (rand < 70) rarity = 'SR';
        else rarity = 'R';
    } else {
        // 通常時 (dailyBuff と offeringBuff の影響を受ける)
        let ssrChance = 2; // 基本2%
        let srChance = 8;  // 基本8% (累積10%)
        let rChance = 25; // 基本25% (累積35%)
        
        if (dailyBuff) {
            if (dailyBuff.type === 'SSR_UP') ssrChance *= 3;
            if (dailyBuff.type === 'SR_UP') srChance *= 3;
        }

        // 供物バフ（加算）
        const now = Date.now();
        if (offeringBuff && offeringBuff.expiresAt > now) {
            ssrChance += offeringBuff.power * 100;
        }

        if (rand < ssrChance) rarity = 'SSR';
        else if (rand < ssrChance + srChance) rarity = 'SR';
        else if (rand < ssrChance + srChance + rChance) rarity = 'R';
        else rarity = 'N';
    }

    // 幸運の魂（ドロップ率UP）の適用
    let luckMult = 1.0;
    Object.values(equippedEnchants).forEach(e => {
        if (e && e.id === 'luck') luckMult *= e.val;
    });
    // SSR/SRの判定を少し甘くする（簡易的に、N/Rなら再抽選してSRに上げることがある）
    if (rarity === 'N' || rarity === 'R') {
        if (Math.random() < (luckMult - 1.0)) {
            rarity = 'SR';
        }
    }

    if (Math.random() < (rarity === 'UR' || rarity === 'SSR' ? 0.4 : enchantChance)) {
        enchant = ENCHANTMENTS[Math.floor(Math.random() * ENCHANTMENTS.length)];
    }

    // equipmentDBから該当レアリティのアイテムを抽選
    const pool = equipmentDB.filter(e => e.rarity === rarity);
    const baseItem = pool[Math.floor(Math.random() * pool.length)] || equipmentDB[0];

    return {
        id: `${baseItem.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        baseId: baseItem.id, // 基底アイテムへの参照
        name: baseItem.name,
        rarity: rarity,
        type: baseItem.type,
        // 個体値（品質）の抽選 (0.5〜1.5: 幅を持たせて当たり外れを作る)
        quality: 0.5 + Math.random() * 1.0,
        atk: Math.round(baseItem.atk * (0.5 + Math.random() * 1.0)), // 個体差
        def: Math.round(baseItem.def * (0.5 + Math.random() * 1.0)),
        enchant: enchant
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
    if (!staminaCountText || !diveBtn) return;
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
        
        // 再来の魂（回復速度UP）の適用
        let recoveryMult = 1.0;
        Object.values(equippedEnchants).forEach(e => {
            if (e && e.id === 'recovery') recoveryMult *= e.val;
        });
        const effectiveInterval = STAMINA_RECOVERY_MS / recoveryMult;

        if (diff >= effectiveInterval) {
            const recovery = Math.floor(diff / effectiveInterval);
            stamina = Math.min(MAX_STAMINA, stamina + recovery);
            lastStaminaUpdate = now - (diff % effectiveInterval);
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
        if (itemId && inventory && inventory[itemId]) {
            const inv = inventory[itemId];
            const baseId = inv.baseId || itemId; // baseId優先、なければ旧互換でitemId
            const base = equipmentDB.find(e => e.id === baseId);
            if (!base) return;
            // 基礎値（個体値反映済） + レベルボーナス
            totalAtk += (inv.atk || base.atk) + ((inv.level || 1) - 1) * 2;
            totalDef += (inv.def || base.def) + ((inv.level || 1) - 1) * 2;
            totalCrit += (base.crit || 0);
        }
    });

    statAtk.textContent = totalAtk;
    statDef.textContent = totalDef;
    statCrit.textContent = `${totalCrit}%`;

    const updateEqSlot = (el, type, label) => {
        if (!el) return;
        const itemId = equipped[type];
        if (itemId && inventory && inventory[itemId]) {
            const inv = inventory[itemId];
            const baseId = inv.baseId || itemId; 
            const item = equipmentDB.find(e => e.id === baseId);
            if (!item) {
                el.innerHTML = `${label}: 不明なアイテム`;
                el.className = 'eq-slot empty';
                return;
            }
            const level = inv.level || 1;
            const rInfo = getQualityRank(inv.quality || 1.0);
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

    // エンチャント（ソウルコア）情報の反映
    ['weapon', 'armor', 'accessory'].forEach(type => {
        const enchant = equippedEnchants[type];
        const slotEl = (type === 'weapon' ? eqWeapon : (type === 'armor' ? eqArmor : eqAccessory));
        if (enchant && slotEl) {
            const span = document.createElement('span');
            span.className = 'enchant-tag';
            span.textContent = enchant.name.replace('の魂','');
            slotEl.appendChild(span);
        }
    });

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
            baseId: item.baseId || item.id,
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
        if (!id || !inventory || !inventory[id]) return -1;
        const inv = inventory[id];
        const baseId = inv.baseId || id;
        const base = equipmentDB.find(e => e.id === baseId);
        if (!base) return -1;
        const curAtk = (inv.atk || base.atk) + ((inv.level || 1) - 1) * 2;
        const curDef = (inv.def || base.def) + ((inv.level || 1) - 1) * 2;
        return curAtk + curDef;
    };

    const currentPower = getPower(currentId);
    const invNew = inventory[item.id] || { atk: 0, level: 1, def: 0 };
    const newPower = (invNew.atk || 0) + ((invNew.level || 1) - 1) * 2 + (invNew.def || 0);

    if (newPower > currentPower) {
        equipped[item.type] = item.id;
        isEquipped = true;
    }

    // エンチャント（ソウルコア）の選択ロジック
    if (item.enchant) {
        const currentEnchant = equippedEnchants[item.type];
        if (!currentEnchant) {
            // 現在なしなら自動装備
            equippedEnchants[item.type] = item.enchant;
            addLog(`✨ 【${item.enchant.name}】を自動装着しました！`);
        } else if (currentEnchant.id !== item.enchant.id) {
            // 種類が違うならユーザーに選ばせる
            showEnchantChoice(item);
        } else if (item.enchant.val > currentEnchant.val) {
            // 同種で性能が高いなら自動更新
            equippedEnchants[item.type] = item.enchant;
            addLog(`✨ 【${item.enchant.name}】の性能がアップしました！`);
        }
    }

    updateStatsUI();
    saveData();
    return { isNew, level, isEquipped, statusText };
}

// エンチャント選択UI
let pendingEnchantItem = null;
const enchantOverlay = document.getElementById('enchant-overlay');

function showEnchantChoice(item) {
    pendingEnchantItem = item;
    const current = equippedEnchants[item.type];
    
    document.getElementById('current-enchant-name').textContent = current ? current.name : 'なし';
    document.getElementById('current-enchant-desc').textContent = current ? current.desc : '-';
    
    document.getElementById('new-enchant-name').textContent = item.enchant.name;
    document.getElementById('new-enchant-desc').textContent = item.enchant.desc;
    
    if (enchantOverlay) enchantOverlay.classList.add('active');
}

const keepEnchantBtn = document.getElementById('keep-enchant-btn');
const swapEnchantBtn = document.getElementById('swap-enchant-btn');

if (keepEnchantBtn) {
    keepEnchantBtn.addEventListener('click', () => {
        if (enchantOverlay) enchantOverlay.classList.remove('active');
        if (pendingEnchantItem) {
            const current = equippedEnchants[pendingEnchantItem.type];
            const name = current ? current.name : 'なし';
            addLog(`✨ コア【${name}】を維持しました。`);
        }
        pendingEnchantItem = null;
    });
}
if (swapEnchantBtn) {
    swapEnchantBtn.addEventListener('click', () => {
        if (enchantOverlay) enchantOverlay.classList.remove('active');
        if (pendingEnchantItem) {
            equippedEnchants[pendingEnchantItem.type] = pendingEnchantItem.enchant;
            addLog(`✨ 新しいコア【${pendingEnchantItem.enchant.name}】に交換しました！`);
            updateStatsUI();
            saveData();
        }
        pendingEnchantItem = null;
    });
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
    
    resultOverlay.classList.add('active');
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

    // 吸血の魂（勝利時スタミナ回復）の適用
    let vampireChance = 0;
    Object.values(equippedEnchants).forEach(e => {
        if (e && e.id === 'vampire') vampireChance += e.val;
    });
    if (Math.random() < vampireChance) {
        stamina = Math.min(MAX_STAMINA, stamina + 1);
        addLog('✨ 【吸血の魂】によりスタミナが1回復した！');
        updateStaminaUI();
    }

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
const MONETAG_DIRECT_LINK = 'https://omg10.com/4/10783831';

if (adBtn) {
    adBtn.addEventListener('click', () => {
        if (stamina >= MAX_STAMINA) {
            addLog('▶ スタミナは満タンです！');
            return;
        }
        
        if (confirm('スポンサー提供の外部サイトを表示します。（※スタミナ回復用）\nサイトを3秒以上見た後、この画面に戻るとスタミナが全回復します！')) {
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
        document.getElementById('ranking-overlay').classList.add('active');
        renderRanking();
    });
}

if (closeRankingBtn) {
    closeRankingBtn.addEventListener('click', () => {
        document.getElementById('ranking-overlay').classList.remove('active');
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
        // ベース35%、戦闘力に応じて最大45%まで上昇（目標40%前後の「勝てそうで怖い」バランス）
        let winRate = 0.35 + Math.min(0.10, (cp || 0) / 10000); 
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
        crit: baseItem.crit,
        enchant: (Math.random() < 0.5) ? Object.assign({}, ENCHANTMENTS[Math.floor(Math.random() * ENCHANTMENTS.length)]) : null // 禁断は50%で付与
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
            baseId: droppedItem.id, // 基底ID保存 (互換性と分解用)
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
        const currentInv = inventory[eqTarget];
        const currentBase = equipmentDB.find(e => e.id === eqTarget);
        if (currentBase) {
            const currentRarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[currentBase.rarity] || 0;
            const newRarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[droppedItem.rarity] || 0;
            if (newRarityScore > currentRarityScore) {
                equipped[droppedItem.type] = droppedItem.id;
                isEquipped = true;
            }
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
        if (!inv) return;
        const base = equipmentDB.find(e => e.id === id) || { rarity: 'N', atk: 0, def: 0 };
        const rarityScore = { 'N':1, 'R':2, 'SR':3, 'SSR':4, 'UR':5 }[base.rarity] || 1;
        const score = (inv.atk || 0) + (inv.def || 0) + (((inv.level || 1) - 1) * 10) + (rarityScore * 100);
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
    
    resultOverlay.classList.add('active');
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
// --- 最終初期化実行 ---
try {
    loadData();   
    loadRanking();   
    checkDailyMissionsReset();
    updateStatsUI(); 
    updateStaminaUI();
    updateComboUI();
    updateBuffUI();
    checkLoginBonus();
    updateForbiddenUI();
    setInterval(checkStaminaRecovery, 1000);
} catch (e) {
    console.error("Initialization Error:", e);
    addLog("❌ システムエラー: ページを更新してください");
}

// イベントリスナー登録 (初期化エラーに関わらず、要素があれば登録を試みる)
if (diveBtn) diveBtn.addEventListener('click', startDungeon);
if (closeResultBtn) {
    closeResultBtn.addEventListener('click', () => {
        resultOverlay.classList.remove('active');
        addLog('▶ 次の探索の準備ができました。');
    });
}

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
            const lbContent = document.getElementById('login-bonus-content');
            const lbDesc = lbContent ? lbContent.querySelector('p') : null;
            
            const dayTitle = is7thDay 
                ? `<h3 style="color:#ff5252; text-shadow:0 0 10px #ff5252; margin:0 0 10px 0; font-size:1.4rem;">🎉 7日連続ログイン達成！ 🎉</h3>` 
                : `<h3 style="color:#4fc3f7; margin:0 0 10px 0;">連続ログイン: ${consecutiveLoginDays}日目</h3>`;
            
            if (lbDesc) {
                if (is7thDay) {
                    lbDesc.innerHTML = `いつもプレイありがとうございます！<br>スタミナが <strong>20</strong> 回復し、<strong style="color:#ff5252;">最高レアSSRが確定</strong>しました！`;
                } else {
                    lbDesc.innerHTML = `本日のログインありがとうございます！<br>スタミナが満タンになりました！`;
                }
            }

            lbItemArea.innerHTML = `
                ${dayTitle}
                <div style="font-size:0.9rem; color:#aaa; margin-bottom:10px;">本日の特別配給</div>
                <img src="images/${bonusItem.type}.png" class="glow-${bonusItem.rarity.toLowerCase()}" style="width:80px; height:80px; border-radius:10px; object-fit:cover; margin:0 auto; display:block;">
                <div style="font-size:1.2rem; font-weight:bold; margin-top:10px;" class="rarity-${bonusItem.rarity.toLowerCase()}">${bonusItem.name}</div>
            `;
            lbOverlay.classList.add('active');
        }
        
        saveData();
        updateStaminaUI();
    }
}

const closeLoginBonusBtn = document.getElementById('close-login-bonus-btn');
if (closeLoginBonusBtn) {
    closeLoginBonusBtn.addEventListener('click', () => {
        document.getElementById('login-bonus-overlay').classList.remove('active');
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
        missionOverlay.classList.add('active');
    });
}
if (closeMissionBtn) {
    closeMissionBtn.addEventListener('click', () => {
        missionOverlay.classList.remove('active');
    });
}

// --- 分解システム関連 ---
const inventoryOverlay = document.getElementById('inventory-overlay');
const inventoryList = document.getElementById('inventory-list');
const materialCountText = document.getElementById('material-count');
const inventoryBtn = document.getElementById('inventory-btn');
const closeInventoryBtn = document.getElementById('close-inventory-btn');
const dismantleBulkBtn = document.getElementById('dismantle-bulk-btn');

const MATERIAL_RATES = { 'N': 1, 'R': 5, 'SR': 50, 'SSR': 500, 'UR': 5000 };

function updateMaterialUI() {
    if (materialCountText) materialCountText.textContent = materials;
}

function renderInventory() {
    if (!inventoryList) return;
    inventoryList.innerHTML = '';
    updateMaterialUI();

    const equippedIds = Object.values(equipped);
    const invKeys = Object.keys(inventory);

    if (invKeys.length === 0) {
        inventoryList.innerHTML = '<li style="color:#888; text-align:center; padding:20px;">バッグは空です</li>';
        return;
    }

    // 装備中のアイテムを除外して表示
    const availableItems = invKeys
        .filter(id => !equippedIds.includes(id))
        .map(id => ({ id, ...inventory[id] }))
        .sort((a, b) => {
            const rScore = { 'UR': 5, 'SSR': 4, 'SR': 3, 'R': 2, 'N': 1 };
            const bIdA = a.baseId || a.id.split('_')[0];
            const bIdB = b.baseId || b.id.split('_')[0];
            const itemA = equipmentDB.find(e => e.id === bIdA) || { rarity: 'N' };
            const itemB = equipmentDB.find(e => e.id === bIdB) || { rarity: 'N' };
            return rScore[itemB.rarity] - rScore[itemA.rarity]; // レア度降順
        });

    if (availableItems.length === 0) {
        inventoryList.innerHTML = '<li style="color:#888; text-align:center; padding:20px;">分解可能なアイテムはありません<br>(装備中を除く)</li>';
        return;
    }

    availableItems.forEach(invItem => {
        const bId = invItem.baseId || invItem.id.split('_')[0];
        const base = equipmentDB.find(e => e.id === bId) || { name: '不明な装備', rarity: 'N', atk: 0, def: 0 };
        const li = document.createElement('li');
        li.className = 'inventory-item';
        
        const qRank = getQualityRank(invItem.quality || 1.0);
        const gain = MATERIAL_RATES[base.rarity] || 0;
        const dispAtk = invItem.atk !== undefined ? invItem.atk : (base.atk || 0);
        const dispDef = invItem.def !== undefined ? invItem.def : (base.def || 0);

        li.innerHTML = `
            <div class="inventory-item-info">
                <span class="inventory-item-name rarity-${base.rarity.toLowerCase()}">${base.name} Lv${invItem.level || 1} [${qRank.rank}]</span>
                <span class="inventory-item-detail">ATK:${dispAtk} DEF:${dispDef} (分解時: +${gain})</span>
            </div>
            <button class="btn dismantle-btn" onclick="dismantleItem('${invItem.id}')">分解</button>
        `;
        inventoryList.appendChild(li);
    });
}

window.dismantleItem = function(id) {
    const invItem = inventory[id];
    if (!invItem) return;
    
    const bId = invItem.baseId || id.split('_')[0];
    const base = equipmentDB.find(e => e.id === bId);
    const rarity = base ? base.rarity : 'N';
    const name = base ? base.name : '不明な装備';

    if (confirm(`「${name}」を分解して、マナの欠片 ${MATERIAL_RATES[rarity]}個 に変換しますか？`)) {
        materials += MATERIAL_RATES[rarity];
        delete inventory[id];
        saveData();
        renderInventory();
        addLog(`🔧 ${name}を分解しました。`);
    }
};

function dismantleBulk() {
    const equippedIds = Object.values(equipped);
    const targetIds = Object.keys(inventory).filter(id => {
        if (equippedIds.includes(id)) return false;
        const invItem = inventory[id];
        const bId = invItem.baseId || id.split('_')[0];
        const base = equipmentDB.find(e => e.id === bId);
        return base && (base.rarity === 'N' || base.rarity === 'R');
    });

    if (targetIds.length === 0) {
        alert('分解可能な N または R 装備がありません。');
        return;
    }

    if (confirm(`非装備中の N と R 装備 (${targetIds.length}個) を一括分解しますか？`)) {
        let totalGain = 0;
        targetIds.forEach(id => {
            const invItem = inventory[id];
            const bId = invItem.baseId || id.split('_')[0];
            const base = equipmentDB.find(e => e.id === bId);
            totalGain += MATERIAL_RATES[base.rarity] || 0;
            delete inventory[id];
        });
        materials += totalGain;
        saveData();
        renderInventory();
        alert(`一括分解完了！マナの欠片 ${totalGain}個 を獲得しました。`);
        addLog(`🔧 装備${targetIds.length}個を一括分解しました。`);
    }
}

if (inventoryBtn) {
    inventoryBtn.addEventListener('click', () => {
        switchInventoryTab('bag'); // デフォルトでバッグタブを開く
        inventoryOverlay.classList.add('active');
    });
}

if (closeInventoryBtn) {
    closeInventoryBtn.addEventListener('click', () => {
        inventoryOverlay.classList.remove('active');
    });
}

if (dismantleBulkBtn) {
    dismantleBulkBtn.addEventListener('click', dismantleBulk);
}

// --- 合成進化システム関連 (STEP 1 & 2: 統合ロジックとUI) ---
const tabBag = document.getElementById('tab-bag');
const tabEvolve = document.getElementById('tab-evolve');
const tabOffering = document.getElementById('tab-offering');
const bagPane = document.getElementById('inventory-bag-pane');
const evolvePane = document.getElementById('inventory-evolve-pane');
const offeringPane = document.getElementById('inventory-offering-pane');
const evolutionList = document.getElementById('evolution-list');
const offeringList = document.getElementById('offering-list');

/**
 * インベントリのタブを切り替える
 */
function switchInventoryTab(tab) {
    [tabBag, tabEvolve, tabOffering].forEach(t => t.classList.remove('active-tab'));
    [bagPane, evolvePane, offeringPane].forEach(p => p.classList.add('hidden'));

    if (tab === 'bag') {
        tabBag.classList.add('active-tab');
        bagPane.classList.remove('hidden');
        renderInventory();
    } else if (tab === 'evolve') {
        tabEvolve.classList.add('active-tab');
        evolvePane.classList.remove('hidden');
        renderEvolution();
    } else if (tab === 'offering') {
        tabOffering.classList.add('active-tab');
        offeringPane.classList.remove('hidden');
        renderOffering();
    }
}

if (tabBag) tabBag.addEventListener('click', () => switchInventoryTab('bag'));
if (tabEvolve) tabEvolve.addEventListener('click', () => switchInventoryTab('evolve'));
if (tabOffering) tabOffering.addEventListener('click', () => switchInventoryTab('offering'));

/**
 * 供物画面の描画
 */
function renderOffering() {
    if (!offeringList) return;
    offeringList.innerHTML = '';

    // 現在のバフ状態表示
    const statusText = document.getElementById('offering-status-text');
    if (statusText) {
        const now = Date.now();
        if (offeringBuff && offeringBuff.expiresAt > now) {
            const p = (offeringBuff.power * 100).toFixed(0);
            const remainMin = Math.ceil((offeringBuff.expiresAt - now) / 60000);
            statusText.textContent = `発動中：SSR率+${p}% (残り約${remainMin}分)`;
        } else {
            statusText.textContent = `現在、供物バフは発生していません`;
        }
    }

    // 祈願ボタンリストの作成 (マナ消費型への転換)
    const offerings = [
        { name: '初級祈願', cost: 100, power: 0.01, desc: 'SSR率 +1%' },
        { name: '上級祈願', cost: 500, power: 0.03, desc: 'SSR率 +3%' },
        { name: '禁断祈願', cost: 2000, power: 0.05, desc: 'SSR率 +5%' }
    ];

    offerings.forEach(off => {
        const isManaReady = materials >= off.cost;
        const li = document.createElement('li');
        li.className = 'inventory-item';
        li.style.padding = '15px';
        li.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        li.innerHTML = `
            <div class="inventory-item-info">
                <span class="inventory-item-name" style="color:#ffb300;">${off.name}</span>
                <div class="inventory-item-detail" style="color:#fff;">${off.desc} / 30分間</div>
                <div style="font-size:0.7rem; color:${isManaReady ? '#4caf50' : '#ff5252'};">コスト: ${off.cost} マナ</div>
            </div>
            <button class="btn offering-btn" ${!isManaReady ? 'disabled' : ''} onclick="pray('${off.cost}', ${off.power})">祈る</button>
        `;
        offeringList.appendChild(li);
    });
}

/**
 * 祈願（供物システム）の実行
 */
window.pray = function(cost, power) {
    if (materials < cost) return;

    if (!confirm(`${cost} マナを消費して祈りを捧げますか？\n(30分間SSR率がアップします)`)) return;

    materials -= parseInt(cost);
    const expireTime = Date.now() + (30 * 60 * 1000); // 30分
    
    offeringBuff = { 
        rarity: 'MANA',
        power: power,
        expiresAt: expireTime
    };

    saveData();
    renderOffering();
    updateBuffUI();
    updateMaterialUI();
    
    addLog(`🙏 祈りが通じた！30分間、幸運が舞い降りる...！！`);
    
    // 軽い振動演出
    gameContainer.classList.add('shake');
    setTimeout(() => gameContainer.classList.remove('shake'), 500);
}

/**
 * アイテムを供物として捧げる
 */
window.offerItem = function(id) {
    const invItem = inventory[id];
    if (!invItem) return;

    const bId = invItem.baseId || id.split('_')[0];
    const base = equipmentDB.find(e => e.id === bId);
    if (!base) return;

    if (!confirm(`「${base.name}」を供物として捧げますか？\n(このアイテムは消失します)`)) return;

    // バフ設定: N:0.5%/5回, R:2%/10回, SR:10%/15回, SSR:30%/30回
    const BUFF_CONFIG = {
        'N':   { power: 0.005, remaining: 5 },
        'R':   { power: 0.02,  remaining: 10 },
        'SR':  { power: 0.10,  remaining: 15 },
        'SSR': { power: 0.30,  remaining: 30 },
        'UR':  { power: 0.80,  remaining: 100 } // 一応
    };

    const config = BUFF_CONFIG[base.rarity] || { power: 0, remaining: 0 };
    offeringBuff = { 
        rarity: base.rarity,
        power: config.power,
        remaining: config.remaining
    };

    delete inventory[id];
    saveData();
    renderOffering();
    updateBuffUI();
    
    addLog(`🙏 「${base.name}」を捧げた。祈りが通じ、幸運が舞い降りた！`);
    
    // 軽い振動演出
    gameContainer.classList.add('shake');
    setTimeout(() => gameContainer.classList.remove('shake'), 500);
}

/**
 * 進化画面の描画
 */
function renderEvolution() {
    if (!evolutionList) return;
    evolutionList.innerHTML = '';

    const equippedIds = Object.values(equipped);
    const counts = { 'N': 0, 'R': 0, 'SR': 0, 'SSR': 0 };

    Object.keys(inventory).forEach(id => {
        if (!equippedIds.includes(id)) {
            const invItem = inventory[id];
            const bId = invItem.baseId || id.split('_')[0];
            const base = equipmentDB.find(e => e.id === bId);
            if (base && counts[base.rarity] !== undefined) {
                counts[base.rarity]++;
            }
        }
    });

    const evolutions = [
        { from: 'N', to: 'R' },
        { from: 'R', to: 'SR' },
        { from: 'SR', to: 'SSR' }
    ];

    evolutions.forEach(evo => {
        const count = counts[evo.from];
        const isItemsReady = count >= EVO_COST;
        const manaCost = EVO_MANA_COSTS[evo.from] || 0;
        const isManaReady = materials >= manaCost;
        const isReady = isItemsReady && isManaReady;
        
        const remaining = Math.max(0, EVO_COST - count);
        
        // マナ不足メッセージの生成
        let manaHint = '';
        if (isItemsReady && !isManaReady) {
            const diff = manaCost - materials;
            const dismantleN = Math.ceil(diff / 1); // N分解は1マナ想定
            manaHint = `<div style="font-size:0.7rem; color:#ff5252; margin-top:4px;">あと ${diff} マナ不足 (N分解 ${dismantleN}回分)</div>`;
        } else if (isItemsReady && isManaReady) {
            manaHint = `<div style="font-size:0.7rem; color:#4caf50; margin-top:4px;">マナ条件クリア！</div>`;
        }

        const div = document.createElement('div');
        div.className = `evolution-item ${isReady ? 'ready-to-evolve' : ''}`;
        div.innerHTML = `
            <div class="evo-rarity-info">
                <div class="evo-rarity-name rarity-${evo.from.toLowerCase()}">${evo.from} ➡ ${evo.to}</div>
                <div>
                    <span class="evo-count-badge ${isItemsReady ? 'ready' : ''}">${count} / ${EVO_COST}</span>
                    <span style="font-size:0.75rem; color:#aaa; margin-left:5px;">コスト: ${manaCost} マナ</span>
                </div>
                ${manaHint}
            </div>
            <button class="btn primary btn-evolve" ${!isReady ? 'disabled' : ''} onclick="evolveItems('${evo.from}')">
                進化
            </button>
        `;
        evolutionList.appendChild(div);
    });
}

/**
 * 特定のレアリティのアイテムを生成するヘルパー
 */
function createEvolvedItem(rarity, level) {
    const pool = equipmentDB.filter(e => e.rarity === rarity);
    if (pool.length === 0) return null;
    
    const baseItem = pool[Math.floor(Math.random() * pool.length)];
    const quality = 0.8 + Math.random() * 0.8;
    
    // エンチャント抽選 (15%)
    let enchant = null;
    if (Math.random() < 0.15) {
        enchant = ENCHANTMENTS[Math.floor(Math.random() * ENCHANTMENTS.length)];
    }

    const item = {
        id: `${baseItem.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        baseId: baseItem.id,
        name: baseItem.name,
        rarity: rarity,
        type: baseItem.type,
        // 進化アイテムの個体値 (0.8〜1.5: 努力の結晶なのでドロップより最低値が高い)
        quality: 0.8 + Math.random() * 0.7,
        atk: Math.round(baseItem.atk * (0.8 + Math.random() * 0.7)),
        def: Math.round(baseItem.def * (0.8 + Math.random() * 0.7)),
        enchant: enchant
    };

    return { item, level };
}

/**
 * アイテムの進化を実行する
 */
window.evolveItems = async function(sourceRarity) {
    if (sourceRarity === 'SSR') {
        addLog('❌ SSRからURへの進化は行えません。');
        return null;
    }
    
    const equippedIds = Object.values(equipped);
    const eligibleIds = Object.keys(inventory).filter(id => {
        if (equippedIds.includes(id)) return false;
        const invItem = inventory[id];
        const bId = invItem.baseId || id.split('_')[0];
        const base = equipmentDB.find(e => e.id === bId);
        return base && base.rarity === sourceRarity;
    });

    if (eligibleIds.length < EVO_COST) {
        addLog(`❌ 素材が足りません（あと ${EVO_COST - eligibleIds.length} 個必要）。`);
        return null;
    }

    // 大成功判定 (4%)
    const isGreatSuccess = Math.random() < 0.04;
    
    // 素材の確定
    const materialIds = eligibleIds.slice(0, EVO_COST);
    let totalLevel = 1; // 修正
    materialIds.forEach(id => {
        totalLevel += (inventory[id].level || 1);
    });

    // 平均レベルの30%
    const avgLevel = totalLevel / EVO_COST;
    const newLevel = Math.max(1, Math.floor(avgLevel * EVO_LEVEL_INHERIT_RATE));

    // レアリティ決定
    const rarityOrder = ['N', 'R', 'SR', 'SSR'];
    let currentIndex = rarityOrder.indexOf(sourceRarity);
    let nextIndex = currentIndex + (isGreatSuccess ? 2 : 1);
    if (nextIndex >= rarityOrder.length) nextIndex = rarityOrder.length - 1; // SSR止まり
    const nextRarity = rarityOrder[nextIndex];

    // 演出：タメ (0.5s)
    await new Promise(resolve => setTimeout(resolve, 500));

    // マナコストのチェック
    const manaCost = EVO_MANA_COSTS[sourceRarity] || 0;
    if (materials < manaCost) {
        addLog(`❌ マナが足りません（あと ${manaCost - materials} 個必要）。`);
        return null;
    }

    // 新アイテムの生成
    const evolved = createEvolvedItem(nextRarity, newLevel);
    if (!evolved) return null;

    // コストの支払い
    materials -= manaCost;
    updateMaterialUI();

    // 素材の削除
    materialIds.forEach(id => delete inventory[id]);

    // 追加
    const newItem = evolved.item;
    inventory[newItem.id] = {
        baseId: newItem.baseId,
        level: evolved.level,
        atk: newItem.atk,
        def: newItem.def,
        quality: isGreatSuccess ? 1.6 : newItem.quality // 大成功時は品質も高め
    };

    saveData();
    playEvolutionEffect(isGreatSuccess, { ...newItem, level: newLevel });
    
    updateStatsUI();
    
    // 現在のタブに合わせてUI更新
    if (evolvePane && !evolvePane.classList.contains('hidden')) {
        renderEvolution();
    } else if (bagPane && !bagPane.classList.contains('hidden')) {
        renderInventory();
    }

    const logColorClass = `rarity-${nextRarity.toLowerCase()}`;
    const successMsg = isGreatSuccess ? '🔥 大成功！！レアリティ2段階上昇！！' : '✨ 進化成功！';
    addLog(`<span class="${logColorClass}">${successMsg} 「${newItem.name} Lv${newLevel}」を獲得！</span>`);
    
    return { item: newItem, level: newLevel };
};

/**
 * 初期化時のバフ更新タイマー
 */
setInterval(updateBuffUI, 1000);

// --- 法務モーダル（AdSense審査用）の制御 ---
const LEGAL_TEXTS = {
    privacy: {
        title: 'プライバシーポリシー',
        body: `
            <h3>1. 広告の配信について</h3>
            <p>当サイトでは、第三者配信の広告サービス「Google アドセンス」を利用しています。広告配信事業者は、ユーザーの興味に応じた商品やサービスの広告を表示するため、当サイトや他サイトへのアクセスに関する情報 「Cookie」(氏名、住所、メール アドレス、電話番号は含まれません) を使用することがあります。</p>
            <p>Googleアドセンスに関して、このプロセスの詳細やこのような情報が広告配信事業者に使用されないようにする方法については、<a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank">Googleのポリシーと規約</a>をご覧ください。</p>
            
            <h3>2. アクセス解析ツールについて</h3>
            <p>当サイトでは、アクセス解析のためにCookieを使用しています。このデータは匿名で収集されており、個人を特定するものではありません。ブラウザの設定でCookieを無効にすることで収集を拒否することが出来ます。</p>

            <h3>3. 免責事項</h3>
            <p>当サイトのコンテンツ・情報について、可能な限り正確な情報を掲載するよう努めておりますが、正確性や安全性を保証するものではありません。当サイトに掲載された内容によって生じた損害等の一切の責任を負いかねますのでご了承ください。</p>
        `
    },
    tos: {
        title: '免責事項・利用規約',
        body: `
            <h3>著作権について</h3>
            <p>当サイトで掲載している文章や画像などにつきましては、無断転載することを禁止します。当サイトは著作権や肖像権の侵害を目的としたものではありません。著作権や肖像権に関して問題がございましたら、お問い合わせフォームよりご連絡ください。迅速に対応いたします。</p>
            
            <h3>リンクについて</h3>
            <p>当サイトは基本的にリンクフリーです。リンクを行う場合の許可や連絡は不要です。ただし、インラインフレームの使用や画像の直リンクはご遠慮ください。</p>
        `
    },
    contact: {
        title: 'お問い合わせ',
        body: `
            <p>当サイトに関するお問い合わせ、ご意見、ご要望は以下の連絡先までお願いいたします。</p>
            <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:10px; margin-top:20px;">
                運営者：<strong>Aida</strong><br>
                連絡先：<strong>pinokio7pinoko@yahoo.co.jp</strong>
            </div>
            <p style="margin-top:20px; font-size:0.8rem; color:#888;">※返信にはお時間をいただく場合がございます。あらかじめご了承ください。</p>
        `
    }
};

window.showLegal = function(type) {
    const data = LEGAL_TEXTS[type];
    if (!data) return;
    
    document.getElementById('legal-title').textContent = data.title;
    document.getElementById('legal-body').innerHTML = data.body;
    document.getElementById('legal-overlay').classList.add('active');
};

const closeLegalBtn = document.getElementById('close-legal-btn');
if (closeLegalBtn) {
    closeLegalBtn.addEventListener('click', () => {
        document.getElementById('legal-overlay').classList.remove('active');
    });
}
