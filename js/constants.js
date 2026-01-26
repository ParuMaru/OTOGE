// js/constants.js

export const CONFIG = {
    NOTE_SPEED: 1000,
    JUDGE_LINE_Y: 500,
    LANE_WIDTH: 100,
    LANE_COUNT: 4,
    START_DELAY: 2.0,
    JUDGE_WINDOW: {
        PERFECT: 0.050,
        GREAT:   0.100,
        GOOD:     0.200
    },
    KEYS: ['d', 'f', 'j', 'k'],
    SONG_BASE_PATH: 'assets/songs/',
    LANE_RATIOS: null // 追加: レーン幅の比率用
};

export const JUDGE_RANGES = {
    PERFECT: 0.033,
    GREAT: 0.092,
    GOOD: 0.142
};

export function configureGameMode(mode) {
    if (mode === '7K') { // 8Kを7Kに変更
        // --- 7ボタン (SDF SPACE JKL) ---
        CONFIG.LANE_COUNT = 7;
        // キー配置: スペースキーは ' '
        CONFIG.KEYS = ['s', 'd', 'f', ' ', 'j', 'k', 'l']; 
        
        // レーン幅の比率 (左右は1、真ん中だけ1.5倍)
        CONFIG.LANE_RATIOS = [1, 1, 1, 1.5, 1, 1, 1];
    } else {
        // --- 4ボタン ---
        CONFIG.LANE_COUNT = 4;
        CONFIG.KEYS = ['d', 'f', 'j', 'k'];
        CONFIG.LANE_RATIOS = null; // 均等
    }
}