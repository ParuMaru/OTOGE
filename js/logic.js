// js/logic.js
import { state } from './state.js';
import { CONFIG, JUDGE_RANGES } from './constants.js';
import { playSound, playMusic } from './audio.js';

const uiScore = document.getElementById('score');

// 判定誤差計算（BPM停止考慮）
export function getEffectiveDiff(currentTime, targetTime) {
    let rawDiff = targetTime - currentTime;
    if (rawDiff <= 0) return rawDiff;

    if (state.bpmEvents) {
        for (let i = 0; i < state.bpmEvents.length - 1; i++) {
            const evt = state.bpmEvents[i];
            const nextEvt = state.bpmEvents[i+1];
            
            if (evt.bpm === 0) {
                const overlapStart = Math.max(currentTime, evt.time);
                const overlapEnd = Math.min(targetTime, nextEvt.time);
                
                if (overlapEnd > overlapStart) {
                    const overlap = overlapEnd - overlapStart;
                    rawDiff -= overlap;
                }
            }
        }
    }
    return rawDiff;
}

// 判定処理とスコア更新
export function handleJudge(judge, timing) {
    const currentTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;

    let totalScoreableCounts = 0;
    state.notes.forEach(n => {
        if (n.duration > 0) totalScoreableCounts += 2; 
        else totalScoreableCounts += 1; 
    });
    
    const totalCounts = totalScoreableCounts > 0 ? totalScoreableCounts : 1;
    const unitScore = 1000000 / totalCounts;

    if (judge === 'MISS') {
        state.judgeCounts.miss++;
        state.combo = 0;
        state.lastJudge.color = '#888';
        state.lastJudge.timing = '';
    } else {
        state.combo++;
        if (state.combo > state.maxCombo) state.maxCombo = state.combo;
        
        if (judge === 'PERFECT') {
            state.judgeCounts.perfect++;
            state.score += unitScore; 
            state.lastJudge.color = '#ffd700'; 
        } else if (judge === 'GREAT') {
            state.judgeCounts.great++;
            state.score += unitScore * 0.5; 
            state.lastJudge.color = '#0f0'; 
        } else if (judge === 'GOOD') {
            state.judgeCounts.good++; 
            state.score += unitScore * 0.1; 
            state.lastJudge.color = '#00fffa'; 
        }
        state.lastJudge.timing = timing;
    }
    
    if (state.score > 1000000) state.score = 1000000;

    // UI更新
    const displayScore = Math.round(state.score).toString().padStart(7, '0');
    state.lastJudge.text = judge;
    state.lastJudge.time = currentTime;
    
    //  全ノーツ処理完了チェック
    const remainingNotes = state.notes.filter(n => n.visible).length;
    if (remainingNotes === 0 && !state.isInputFinished) {
        state.isInputFinished = true;
    }
    
    if (uiScore) {
        const mult = state.speedMultiplier || 1.0;
        const actual = Math.round(CONFIG.NOTE_SPEED * mult);
        uiScore.innerHTML = `SCORE: ${displayScore}<br><span style="font-size:0.7em; color:#aaa">SPD: ${actual} (x${mult.toFixed(1)})</span>`;
    }
}

// ゲーム本番開始（待機解除）
export function startRealGame() {
    if (!state.isWaitingStart) return;

    for (let i = 0; i < CONFIG.LANE_COUNT; i++) {
        state.keyState[i] = false;
    }

    playMusic(state.musicBuffer);
    state.startTime = state.audioCtx.currentTime - state.songOffset;
    state.isWaitingStart = false; 
}

// ヒットエフェクト生成
export function createHitEffect(laneIdx) {
    const currentTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
    state.hitEffects.push({ lane: laneIdx, startTime: currentTime, duration: 0.3 });
}

// キャリブレーションのタップ処理
export function handleCalibrationTap() {
    if (!state.calibData.active) return;
    const data = state.calibData;
    
    const tapTime = state.audioCtx.currentTime;
    const lastBeatIndex = data.beatCount - 1;
    const targetTime = (data.startTime + 1.0) + (lastBeatIndex * data.interval);
    const diff = tapTime - targetTime;
    
    if (Math.abs(diff) > 0.25) return;
    if (lastBeatIndex < 4) return;
    
    data.diffs.push(diff);
    
    const statusDiv = document.getElementById('calib-status');
    if(statusDiv) {
        statusDiv.style.opacity = 0.5;
        setTimeout(() => statusDiv.style.opacity = 1, 50);
    }
}