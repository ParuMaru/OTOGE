// js/renderer.js
import { CONFIG } from './constants.js';

let canvas = null;
let ctx = null;

const getLaneRect = (laneIdx) => {
    // 比率設定がない場合は均等割り
    if (!CONFIG.LANE_RATIOS) {
        const w = CONFIG.LANE_WIDTH;
        const totalW = w * CONFIG.LANE_COUNT;
        const startX = (canvas.width - totalW) / 2;
        return { x: startX + laneIdx * w, w: w };
    }

    // 比率設定がある場合 (7Kモードなど)
    const ratios = CONFIG.LANE_RATIOS;
    const totalRatio = ratios.reduce((sum, r) => sum + r, 0);
    const totalGameWidth = CONFIG.LANE_WIDTH * CONFIG.LANE_COUNT; 
    const unitWidth = totalGameWidth / totalRatio;
    const startX = (canvas.width - totalGameWidth) / 2;

    let currentX = startX;
    for (let i = 0; i < laneIdx; i++) {
        currentX += ratios[i] * unitWidth;
    }
    
    return { x: currentX, w: ratios[laneIdx] * unitWidth };
};

export function initRenderer(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
}

export function renderGame(state) {
    // 画面クリア
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawField(state);
    drawJudgeUI(state);
    drawNotes(state);
    drawEffects(state); 
}

function drawField(state) {
    // 判定ライン
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.JUDGE_LINE_Y);
    ctx.lineTo(canvas.width, CONFIG.JUDGE_LINE_Y);
    ctx.stroke();

    // レーン描画
    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        const { x, w } = getLaneRect(i);
        
        // 区切り線（右端）
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w, 0);
        ctx.lineTo(x + w, canvas.height);
        ctx.stroke();
        
        // 左端の線 (最初のレーンのみ)
        if (i === 0) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // レーン発光
        if (state.laneLights[i] > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${state.laneLights[i] * 0.4})`;
            ctx.fillRect(x, 0, w, canvas.height);
            
            const grad = ctx.createLinearGradient(x, CONFIG.JUDGE_LINE_Y - 50, x, CONFIG.JUDGE_LINE_Y + 50);
            grad.addColorStop(0, `rgba(0, 255, 255, 0)`);
            grad.addColorStop(0.5, `rgba(0, 255, 255, ${state.laneLights[i]})`);
            grad.addColorStop(1, `rgba(0, 255, 255, 0)`);
            ctx.fillStyle = grad;
            ctx.fillRect(x, CONFIG.JUDGE_LINE_Y - 50, w, 100);
        }

        // キー文字
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        let keyText = CONFIG.KEYS[i] ? CONFIG.KEYS[i].toUpperCase() : '';
        if(keyText === ' ') keyText = 'SPC';
        
        ctx.fillText(keyText, x + w/2 - 10, CONFIG.JUDGE_LINE_Y + 40);
    }
}

function drawNotes(state) {
    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - (state.globalOffset || 0);
    const currentY = getYPosition(currentSongTime, state);
    const speedScale = (state.speedMultiplier || 1.0) * 4.0;

    state.notes.forEach(note => {
        if (note.hit && !note.isHolding) return;

        const noteY = getYPosition(note.time, state);
        const relativeY = (noteY - currentY) * speedScale;
        let yHead = CONFIG.JUDGE_LINE_Y - relativeY;
        let yTail = yHead; 
        
        if (note.duration > 0) {
            const endY = getYPosition(note.time + note.duration, state);
            const relativeEndY = (endY - currentY) * speedScale;
            yTail = CONFIG.JUDGE_LINE_Y - relativeEndY;
        }

        if (note.isHolding) {
            yHead = CONFIG.JUDGE_LINE_Y;
        }

        const { x, w } = getLaneRect(note.lane);
        const h = 20;

        // --- ロングノーツ描画 ---
        if (note.duration > 0) {
            if (yHead > -100 && yTail < canvas.height) {
                const bodyHeight = yHead - yTail;
                if (bodyHeight > 0) {
                    // 青レーンの場合はロング胴体も青っぽくする
                    if (CONFIG.LANE_COUNT === 7 && (note.lane === 1 || note.lane === 5)) {
                        ctx.fillStyle = 'rgba(0, 200, 255, 0.5)'; // 青緑半透明
                    } else {
                        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; // 緑半透明
                    }
                    ctx.fillRect(x + 2, yTail, w - 4, bodyHeight);
                }
                
                // ロング終端
                if (yTail > -50 && yTail < canvas.height + 50) {
                    if (CONFIG.LANE_COUNT === 7 && (note.lane === 1 || note.lane === 5)) {
                        ctx.fillStyle = '#00aaaa'; // 青緑
                    } else {
                        ctx.fillStyle = '#00aa00'; // 緑
                    }
                    ctx.fillRect(x + 2, yTail - h/2, w - 4, h);
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 2, yTail - h/2, w - 4, h);
                }
            }
        }

        // --- 通常ノーツ描画 ---
        if (yHead > -50 && yHead < canvas.height + 50) {
            // デフォルト色
            ctx.fillStyle = note.duration > 0 ? '#00cc00' : '#ff0055';

            // 7キーモード時の色分け処理
            if (CONFIG.LANE_COUNT === 7) {
                if (note.lane === 1 || note.lane === 5) {
                    ctx.fillStyle = '#00ffff'; // シアン(青)
                } else if (note.lane === 3) {
                    ctx.fillStyle = '#ffaa00'; // 真ん中(SPACE)
                } else if (note.duration === 0) {
                    ctx.fillStyle = '#ff0055'; // 通常
                }
            }

            ctx.fillRect(x + 2, yHead - h/2, w - 4, h);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x + 2, yHead - h/2, w - 4, h);
        }
    });
}

function drawJudgeUI(state) {
    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - (state.globalOffset || 0);
    const timeDiff = currentSongTime - state.lastJudge.time;
    const centerX = canvas.width / 2;
    const centerY = CONFIG.JUDGE_LINE_Y - 150; 

    // 1. 判定文字
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
            ctx.font = 'bold 20px Arial'; 
            ctx.fillStyle = state.lastJudge.timing === 'FAST' ? '#00ccff' : '#ff4444'; 
            ctx.fillText(state.lastJudge.timing, 0, -35);
        }
        ctx.restore();
    }

    // 2. コンボ
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

function drawEffects(state) {
    const currentSongTime = (state.audioCtx.currentTime - state.startTime) - (state.globalOffset || 0);
    
    state.hitEffects.forEach(effect => {
        const elapsed = currentSongTime - effect.startTime;
        const progress = elapsed / effect.duration;
        
        // 可変幅に対応した座標取得
        const { x, w } = getLaneRect(effect.lane);
        const centerX = x + w / 2;
        
        const y = CONFIG.JUDGE_LINE_Y;
        const size = (40 + progress * 80) * (w / 100); // 基準幅100に対する比率でサイズ調整
        const alpha = (1.0 - progress) * 0.6;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255, 220, 100, ${alpha})`;
        ctx.lineWidth = 4 * (1 - progress);
        ctx.beginPath();
        ctx.strokeRect(centerX - size / 2, y - size / 2, size, size);
        ctx.translate(centerX, y);
        ctx.rotate(progress * Math.PI / 2);
        ctx.strokeStyle = `rgba(255, 100, 50, ${alpha * 0.5})`;
        ctx.strokeRect(-size/3, -size/3, size*2/3, size*2/3);
        ctx.restore();
    });
}

function getYPosition(time, state) {
    const events = state.bpmEvents;
    let currentEvt = events[0];
    for (let i = events.length - 1; i >= 0; i--) {
        if (time >= events[i].time) {
            currentEvt = events[i];
            break;
        }
    }
    const timeSinceEvent = time - currentEvt.time;
    return currentEvt.y + (timeSinceEvent * currentEvt.bpm);
}