import { CONFIG } from './constants.js';

let canvas = null;
let ctx = null;

// X座標計算（内部利用）
const getLaneX = (laneIdx) => {
    const totalWidth = CONFIG.LANE_WIDTH * CONFIG.LANE_COUNT;
    const startX = (canvas.width - totalWidth) / 2;
    return startX + laneIdx * CONFIG.LANE_WIDTH;
};

// 初期化
export function initRenderer(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
}

// 全体の描画メイン関数
export function renderGame(state) {
    // 画面クリア
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawField(state);
    drawJudgeUI(state);
    drawNotes(state);
    drawEffects(state); // 追加実装済みのエフェクト描画
}

function drawField(state) {
    // 判定ライン
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.JUDGE_LINE_Y);
    ctx.lineTo(canvas.width, CONFIG.JUDGE_LINE_Y);
    ctx.stroke();

    // レーン区切り線
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= CONFIG.LANE_COUNT; i++) {
        const x = getLaneX(i);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // レーン発光
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        if (state.laneLights[i] > 0) {
            const x = getLaneX(i);
            ctx.fillStyle = `rgba(255, 255, 255, ${state.laneLights[i] * 0.5})`;
            ctx.fillRect(x, 0, CONFIG.LANE_WIDTH, canvas.height);
            
            // グラデーション
            const grad = ctx.createLinearGradient(x, CONFIG.JUDGE_LINE_Y - 50, x, CONFIG.JUDGE_LINE_Y + 50);
            grad.addColorStop(0, `rgba(0, 255, 255, 0)`);
            grad.addColorStop(0.5, `rgba(0, 255, 255, ${state.laneLights[i]})`);
            grad.addColorStop(1, `rgba(0, 255, 255, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x, CONFIG.JUDGE_LINE_Y - 50, CONFIG.LANE_WIDTH, 100);
        }
    }

    // キー文字
    ctx.fillStyle = '#888';
    ctx.font = '16px Arial';
    CONFIG.KEYS.forEach((key, i) => {
        ctx.fillText(key.toUpperCase(), getLaneX(i) + CONFIG.LANE_WIDTH/2 - 5, CONFIG.JUDGE_LINE_Y + 40);
    });
}

function drawNotes(state) {
    const currentSongTime = state.audioCtx.currentTime - state.startTime;

    state.notes.forEach(note => {
        if (!note.visible) return;

        const timeDiff = note.time - currentSongTime;
        const y = CONFIG.JUDGE_LINE_Y - (timeDiff * CONFIG.NOTE_SPEED);

        // 画面内のみ描画
        if (y > -50 && y < canvas.height + 50) {
            const x = getLaneX(note.lane);
            const w = CONFIG.LANE_WIDTH;
            const h = 20;

            ctx.fillStyle = '#ff0055';
            ctx.fillRect(x + 2, y - h/2, w - 4, h);
            ctx.strokeStyle = '#ff99aa';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, y - h/2, w - 4, h);
        }
    });
}

function drawJudgeUI(state) {
    const currentSongTime = state.audioCtx.currentTime - state.startTime;
    const timeDiff = currentSongTime - state.lastJudge.time;
    const centerX = canvas.width / 2;
    const centerY = CONFIG.JUDGE_LINE_Y - 150; 

    // 判定文字
    if (timeDiff >= 0 && timeDiff < 0.5) {
        ctx.save();
        ctx.translate(centerX, centerY);
        const scale = 1.0 + Math.max(0, 0.1 - timeDiff) * 5; 
        ctx.scale(scale, scale);
        const alpha = timeDiff > 0.3 ? 1.0 - (timeDiff - 0.3) * 5 : 1.0;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = state.lastJudge.color;
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 10;
        ctx.fillText(state.lastJudge.text, 0, 0);
        if (state.lastJudge.text !== 'MISS' && state.lastJudge.text !== 'PERFECT' && state.lastJudge.timing) {
            ctx.font = 'bold 20px Arial'; // 少し小さめの文字
            // 色分け: FASTは青、SLOWは赤 (好みで変えてください)
            if (state.lastJudge.timing === 'FAST') {
                ctx.fillStyle = '#00ccff'; // 水色
            } else {
                ctx.fillStyle = '#ff4444'; // 赤
            }
            
            // 判定文字の下(Y+35px)に表示
            ctx.fillText(state.lastJudge.timing, 0, -35);
        }
        ctx.restore();
    }

    // コンボ
    if (state.combo > 0) {
        ctx.save();
        ctx.translate(centerX, centerY + 40);
        const comboScale = timeDiff >= 0 && timeDiff < 0.1 ? 1.2 : 1.0;
        ctx.scale(comboScale, comboScale);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.combo, 0, 0);
        ctx.font = '16px Arial';
        ctx.fillText("COMBO", 0, 25);
        ctx.restore();
    }
}

//爆発エフェクト
function drawEffects(state) {
    const currentSongTime = state.audioCtx.currentTime - state.startTime;  
    state.hitEffects.forEach(effect => {
        const elapsed = currentSongTime - effect.startTime;
        const progress = elapsed / effect.duration;
        const x = getLaneX(effect.lane) + CONFIG.LANE_WIDTH / 2;
        const y = CONFIG.JUDGE_LINE_Y;
        const size = 40 + progress * 80; 
        const alpha = 1.0 - progress;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 220, 100, ${alpha})`;
        ctx.lineWidth = 4 * (1 - progress);
        ctx.beginPath();
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
        ctx.translate(x, y);
        ctx.rotate(progress * Math.PI / 2);
        ctx.strokeStyle = `rgba(255, 100, 50, ${alpha * 0.5})`;
        ctx.strokeRect(-size/3, -size/3, size*2/3, size*2/3);
        ctx.restore();
    });
}