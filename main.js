/**
 * 設定・定数 (Constants)
 */
const CONFIG = {
    NOTE_SPEED: 500,        // ノーツが落ちる速度 (px/秒)
    JUDGE_LINE_Y: 500,      // 判定ラインのY座標
    LANE_WIDTH: 80,         // 1レーンの幅
    LANE_COUNT: 4,          // レーン数
    START_DELAY: 2.0,       // ゲーム開始から曲開始までの待機時間(秒)
    
    // 判定幅 (秒単位: +/-)
    JUDGE_WINDOW: {
        PERFECT: 0.050, // 50ms (3フレーム)
        GREAT:   0.100, // 100ms
        BAD:     0.200  // 200ms
    },

    // キーマッピング
    KEYS: ['d', 'f', 'j', 'k']
};

/**
 * 簡易的な譜面データ (Chart Data)
 * time: 曲開始からの秒数, lane: レーン番号(0-3)
 */
const CHART = [
    { time: 1.0, lane: 0 },
    { time: 1.5, lane: 1 },
    { time: 2.0, lane: 2 },
    { time: 2.5, lane: 3 },
    { time: 3.0, lane: 1 }, { time: 3.0, lane: 2 }, // 同時押し
    { time: 3.5, lane: 0 },
    { time: 4.0, lane: 3 },
    { time: 4.5, lane: 1 },
    { time: 5.0, lane: 2 },
    { time: 5.5, lane: 0 }, { time: 5.5, lane: 3 },
    { time: 6.0, lane: 1 }, { time: 6.25, lane: 2 }, { time: 6.5, lane: 1 }, { time: 6.75, lane: 2 },
    { time: 7.0, lane: 0 }, { time: 7.0, lane: 3 }
];

// ゲームの状態管理
const state = {
    isPlaying: false,
    startTime: 0,       // 曲が始まったAudioContext時刻
    score: 0,
    combo: 0,
    notes: [],          // 現在処理中のノーツオブジェクト
    audioCtx: null,     // Web Audio API Context
    nextNoteIndex: 0,    // 次に生成すべき譜面のインデックス
    laneLights: [0, 0, 0, 0], //レーンの明るさ
    hitEffects: [],
    lastJudge: {
        text: '',        // "PERFECT" などの文字
        time: -10,       // 判定が出た時刻 (初期値は適当な過去)
        color: '#fff'    // 文字色
    }
};

// DOM要素の取得
// 注意: HTML側で読み込みが完了した後に実行される必要があります
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const uiScore = document.getElementById('score');
const uiCombo = document.getElementById('combo');
const overlay = document.getElementById('start-overlay');

// レーンのX座標計算用
const getLaneX = (laneIdx) => {
    const totalWidth = CONFIG.LANE_WIDTH * CONFIG.LANE_COUNT;
    const startX = (canvas.width - totalWidth) / 2;
    return startX + laneIdx * CONFIG.LANE_WIDTH;
};

// --- Audio System (Web Audio API) ---
function initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AudioContext();
}

function playSound(type) {
    if (!state.audioCtx) return;
    const osc = state.audioCtx.createOscillator();
    const gain = state.audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(state.audioCtx.destination);

    if (type === 'hit') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, state.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.5, state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.1);
    } else if (type === 'bgm_beat') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, state.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, state.audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(state.audioCtx.currentTime + 0.05);
    }
}

// --- Game Logic ---

function startGame() {
    initAudio();
    state.isPlaying = true;
    state.startTime = state.audioCtx.currentTime + CONFIG.START_DELAY;
    state.nextNoteIndex = 0;
    state.score = 0;
    state.combo = 0;
    
    state.notes = CHART.map(n => ({
        ...n,
        hit: false,
        visible: true
    }));

    overlay.style.display = 'none';
    requestAnimationFrame(gameLoop);
    
    scheduleMetronome();
}

function scheduleMetronome() {
    if (!state.isPlaying) return;
    const beatInterval = 0.5; 
    const nextBeatTime = Math.ceil((state.audioCtx.currentTime - state.startTime) / beatInterval) * beatInterval + state.startTime;
    
    if (Math.random() < 0.1) playSound('bgm_beat'); 
    setTimeout(scheduleMetronome, 200);
}

function gameLoop() {
    if (!state.isPlaying) return;
    
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) {
            state.laneLights[i] = Math.max(0, state.laneLights[i] - 0.05);
        }
    }

    const currentSongTime = state.audioCtx.currentTime - state.startTime;
    
    // filterを使って「まだ寿命が残っているもの」だけを残した新しい配列に入れ替えます
    state.hitEffects = state.hitEffects.filter(effect => {
        // 経過時間 = 現在時刻 - 発生時刻
        const elapsed = currentSongTime - effect.startTime;
        // 経過時間が寿命より短ければ生存
        return elapsed < effect.duration;
    });

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawField();
    drawJudgeUI();
    
    // ヒットエフェクトの描画
    state.hitEffects.forEach(effect => {
        const currentSongTime = state.audioCtx.currentTime - state.startTime;
        // 経過時間
        const elapsed = currentSongTime - effect.startTime;
        // 進行度 (0.0 が発生直後、1.0 が終了直前)
        const progress = elapsed / effect.duration;

        // エフェクトの中心座標
        const x = getLaneX(effect.lane) + CONFIG.LANE_WIDTH / 2;
        const y = CONFIG.JUDGE_LINE_Y;

        // --- アニメーションのパラメータ計算 ---
        // サイズ: 進行度に合わせて 40px から 120px まで広がる
        const size = 40 + progress * 80; 
        // 透明度: 進行度に合わせて 1.0(不透明) から 0.0(透明) へ変化
        const alpha = 1.0 - progress;

        // --- 描画 ---
        ctx.save(); // 現在の描画設定を保存

        // 光る表現のためにブレンドモードを加算(lighter)にする
        ctx.globalCompositeOperation = 'lighter';
        
        // 色の設定（黄色系で、透明度を適用）
        ctx.strokeStyle = `rgba(255, 220, 100, ${alpha})`;
        ctx.lineWidth = 4 * (1 - progress); // 線もだんだん細くする

        // 中心から広がる四角形を描く
        ctx.beginPath();
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        
        // おまけ：少し回転させてみる（リッチな表現）
        ctx.translate(x, y);
        ctx.rotate(progress * Math.PI / 2); // 90度回転
        ctx.strokeStyle = `rgba(255, 100, 50, ${alpha * 0.5})`;
        ctx.strokeRect(-size/3, -size/3, size*2/3, size*2/3);

        ctx.restore(); // 描画設定を元に戻す
    });

    state.notes.forEach(note => {
        if (!note.visible) return;

        const timeDiff = note.time - currentSongTime;
        const y = CONFIG.JUDGE_LINE_Y - (timeDiff * CONFIG.NOTE_SPEED);

        if (timeDiff < -CONFIG.JUDGE_WINDOW.BAD && !note.hit) {
            note.visible = false;
            handleJudge('MISS');
        }

        if (y > -50 && y < canvas.height + 50) {
            drawNote(note.lane, y);
        }
    });

    if (currentSongTime > CHART[CHART.length-1].time + 2.0) {
        // 終了処理
    }

    requestAnimationFrame(gameLoop);
}

function drawField() {
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.JUDGE_LINE_Y);
    ctx.lineTo(canvas.width, CONFIG.JUDGE_LINE_Y);
    ctx.stroke();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= CONFIG.LANE_COUNT; i++) {
        const x = getLaneX(i);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) {
            const x = getLaneX(i);
            
            // 光の色設定 (白の半透明)
            // state.laneLights[i] が 1.0 なら 0.5(50%)の濃さになるように調整
            ctx.fillStyle = `rgba(255, 255, 255, ${state.laneLights[i] * 0.5})`;
            
            // レーン全体を塗りつぶす
            ctx.fillRect(x, 0, CONFIG.LANE_WIDTH, canvas.height);
            
            // おまけ: 判定ライン付近を少し強く光らせる（グラデーション演出）
            const grad = ctx.createLinearGradient(x, CONFIG.JUDGE_LINE_Y - 50, x, CONFIG.JUDGE_LINE_Y + 50);
            grad.addColorStop(0, `rgba(0, 255, 255, 0)`);
            grad.addColorStop(0.5, `rgba(0, 255, 255, ${state.laneLights[i]})`); // 中心は明るく
            grad.addColorStop(1, `rgba(0, 255, 255, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x, CONFIG.JUDGE_LINE_Y - 50, CONFIG.LANE_WIDTH, 100);
        }
    }
    
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    CONFIG.KEYS.forEach((key, i) => {
        ctx.fillText(key.toUpperCase(), getLaneX(i) + CONFIG.LANE_WIDTH/2 - 5, CONFIG.JUDGE_LINE_Y + 40);
    });
}

function drawNote(lane, y) {
    const x = getLaneX(lane);
    const w = CONFIG.LANE_WIDTH;
    const h = 20;

    ctx.fillStyle = '#ff0055';
    ctx.fillRect(x + 2, y - h/2, w - 4, h);
    ctx.strokeStyle = '#ff99aa';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y - h/2, w - 4, h);
}

// --- Input & Judgment System ---

window.addEventListener('keydown', e => {
    if (!state.isPlaying) return;
    
    const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
    if (keyIndex === -1) return;
    
    state.laneLights[keyIndex] = 1.0; //レーンを光らせる

    const currentSongTime = state.audioCtx.currentTime - state.startTime;
    
    const targetNote = state.notes
        .filter(n => n.lane === keyIndex && !n.hit && n.visible)
        .sort((a, b) => a.time - b.time)[0];

    if (targetNote) {
        const diff = Math.abs(targetNote.time - currentSongTime);

        if (diff <= CONFIG.JUDGE_WINDOW.BAD) {
            targetNote.hit = true;
            targetNote.visible = false;

            let judge = 'BAD';
            if (diff <= CONFIG.JUDGE_WINDOW.PERFECT) judge = 'PERFECT';
            else if (diff <= CONFIG.JUDGE_WINDOW.GREAT) judge = 'GREAT';

            handleJudge(judge);
            playSound('hit');
            createHitEffect(keyIndex);
        }
    }
});

// game.js の handleJudge 関数を丸ごと書き換え
function handleJudge(judge) {
    const currentTime = state.audioCtx.currentTime - state.startTime;

    // 1. スコア・コンボ計算 (ロジックは変更なし)
    if (judge === 'MISS') {
        state.combo = 0;
        state.lastJudge.color = '#888'; // Missはグレー
    } else {
        state.combo++;
        if (judge === 'PERFECT') {
            state.score += 1000;
            state.lastJudge.color = '#ffd700'; // 金色
        } else if (judge === 'GREAT') {
            state.score += 500;
            state.lastJudge.color = '#00ffff'; // 水色
        } else if (judge === 'BAD') {
            state.score += 100;
            state.lastJudge.color = '#ff8800'; // オレンジ
        }
    }
    
    // 2. ★変更: HTMLではなくstateを更新してアニメーションを開始
    state.lastJudge.text = judge;
    state.lastJudge.time = currentTime;

    // HTMLのスコア表示だけは更新しておく（デバッグ用として便利なので）
    if(uiScore) uiScore.innerText = state.score;
    // コンボのHTML更新はもう不要なので削除してもOK
}

    // エフェクト処理
function createHitEffect(laneIdx) {
    const currentTime = state.audioCtx.currentTime - state.startTime;

    // 新しいエフェクトのデータを生成して配列に追加
    state.hitEffects.push({
        lane: laneIdx,       // どのレーンか
        startTime: currentTime, // いつ発生したか
        duration: 0.3        // 何秒で消えるか（0.3秒）
    });
}

// game.js の適当な場所（末尾など）に追加
function drawJudgeUI() {
    const currentTime = state.audioCtx.currentTime - state.startTime;
    const timeDiff = currentTime - state.lastJudge.time;
    
    // 表示場所の中心（画面の横幅の半分、判定ラインより少し上）
    const centerX = canvas.width / 2;
    const centerY = CONFIG.JUDGE_LINE_Y - 150; 

    // --- 1. 判定文字 (PERFECTなど) の描画 ---
    // 判定から0.5秒間だけ表示する
    if (timeDiff >= 0 && timeDiff < 0.5) {
        ctx.save();
        ctx.translate(centerX, centerY);

        // アニメーション: ドンッとはねる動き
        // 0秒時点が1.5倍、0.1秒で1.0倍に戻る動き
        const scale = 1.0 + Math.max(0, 0.1 - timeDiff) * 5; 
        ctx.scale(scale, scale);

        // フェードアウト: 0.3秒過ぎたら透明になっていく
        const alpha = timeDiff > 0.3 ? 1.0 - (timeDiff - 0.3) * 5 : 1.0;
        ctx.globalAlpha = alpha;

        // 文字設定
        ctx.fillStyle = state.lastJudge.color;
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black'; // 文字の影
        ctx.shadowBlur = 10;
        
        ctx.fillText(state.lastJudge.text, 0, 0);
        ctx.restore();
    }

    // --- 2. コンボ数の描画 ---
    // コンボが1以上つながっているときだけ表示
    if (state.combo > 0) {
        ctx.save();
        ctx.translate(centerX, centerY + 40); // 判定文字の少し下

        // コンボが増えた瞬間だけ少し大きくするアニメーション
        // 判定文字と同じタイミングで動く
        const comboScale = timeDiff >= 0 && timeDiff < 0.1 ? 1.2 : 1.0;
        ctx.scale(comboScale, comboScale);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.fillText(state.combo, 0, 0);
        
        // "COMBO" という小さい文字を添える
        ctx.font = '16px Arial';
        ctx.fillText("COMBO", 0, 25);
        
        ctx.restore();
    }
}

// スタートイベント
overlay.addEventListener('click', startGame);