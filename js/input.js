// js/input.js
import { state } from './state.js';
import { CONFIG, JUDGE_RANGES } from './constants.js';
import { playSound } from './audio.js';
import { 
    handleJudge, 
    startRealGame, 
    createHitEffect, 
    getEffectiveDiff,
    handleCalibrationTap
} from './logic.js';

// タッチ識別用マップ
const touchMap = {};

export function initInput(canvas) {
    // キーボード
    window.addEventListener('keydown', e => {
        if (state.currentScene === 'game' && e.repeat) return;
        
        // キャリブレーション中の操作
        if (state.currentScene === 'calibration') {
            handleCalibrationTap();
            return;
        }
        
        // ゲーム開始待機中の操作
        if (state.currentScene === 'game' && state.isWaitingStart) {
            startRealGame();
            return; 
        }

        const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1) {
            state.keyState[keyIndex] = false;
            handleInputDown(keyIndex);
        }
    });

    window.addEventListener('keyup', e => {
        const keyIndex = CONFIG.KEYS.indexOf(e.key.toLowerCase());
        if (keyIndex !== -1) handleInputUp(keyIndex);
    });
    
    // タッチ（キャリブレーション用）
    window.addEventListener('touchstart', (e) => {
        if (state.currentScene === 'calibration') {
            handleCalibrationTap();
        }
    });

    setupTouchEvents(canvas);
}

function setupTouchEvents(canvas) {
    const getLaneFromTouch = (touch) => {
        const rect = canvas.getBoundingClientRect();
        const relativeX = (touch.clientX - rect.left) / rect.width;
        if (relativeX >= 0 && relativeX <= 1) {
            return Math.floor(relativeX * CONFIG.LANE_COUNT);
        }
        return -1;
    };

    canvas.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });

    canvas.addEventListener('touchstart', e => {
        e.preventDefault(); 
        
        if (state.currentScene === 'game' && state.isWaitingStart) {
            startRealGame();
            return;
        }

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = getLaneFromTouch(touch);
            if (lane !== -1 && lane < CONFIG.LANE_COUNT) {
                state.keyState[lane] = false;
                touchMap[touch.identifier] = lane;
                handleInputDown(lane);
            }
        }
    }, { passive: false });

    const handleEnd = (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const lane = touchMap[touch.identifier];
            if (lane !== undefined) {
                handleInputUp(lane);
                delete touchMap[touch.identifier];
            }
        }
    };
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleEnd, { passive: false });
}

function handleInputDown(laneIndex) {
    try {
        if (state.currentScene !== 'game') return;
        if (!state.isPlaying || laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;

        state.laneLights[laneIndex] = 0.3;
        state.keyState[laneIndex] = true;

        const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
        const targetNote = state.notes.find(n => n.lane === laneIndex && !n.hit && n.visible);

        if (targetNote) {
            const effectiveDiff = getEffectiveDiff(currentSongTime, targetNote.time);
            const diffAbs = Math.abs(effectiveDiff);

            if (diffAbs <= JUDGE_RANGES.GOOD) {
                if (targetNote.duration > 0) {
                    targetNote.isHolding = true; 
                    let judge = 'GOOD';
                    if (diffAbs <= JUDGE_RANGES.PERFECT) judge = 'PERFECT';
                    else if (diffAbs <= JUDGE_RANGES.GREAT) judge = 'GREAT';
                    
                    handleJudge(judge, effectiveDiff > 0 ? 'FAST' : 'SLOW');
                    playSound('hit');
                    createHitEffect(laneIndex);
                } else {
                    targetNote.hit = true;
                    targetNote.visible = false;
                    let judge = 'GOOD';
                    if (diffAbs <= JUDGE_RANGES.PERFECT) judge = 'PERFECT';
                    else if (diffAbs <= JUDGE_RANGES.GREAT) judge = 'GREAT';
                    
                    handleJudge(judge, effectiveDiff > 0 ? 'FAST' : 'SLOW');
                    playSound('hit');
                    createHitEffect(laneIndex);
                }
            }
        }
    } catch (e) {
        console.error("Input Error:", e);
        state.keyState[laneIndex] = false;
    }
}

function handleInputUp(laneIndex) {
    try {
        if (state.currentScene !== 'game') return;
        if (laneIndex < 0 || laneIndex >= CONFIG.LANE_COUNT) return;
        
        state.keyState[laneIndex] = false;

        const holdingNote = state.notes.find(n => n.lane === laneIndex && n.isHolding && !n.hit);
        if (holdingNote) {
            const currentSongTime = (state.audioCtx.currentTime - state.startTime) - state.globalOffset;
            const endTime = holdingNote.time + holdingNote.duration;
            
            if (currentSongTime < endTime - 0.1) {
                holdingNote.isHolding = false;
                holdingNote.visible = false; 
                holdingNote.hit = true;      
                handleJudge('MISS', '');         
            }
        }
    } catch (e) {
        console.error("Input Up Error:", e);
        state.keyState[laneIndex] = false;
    }
}