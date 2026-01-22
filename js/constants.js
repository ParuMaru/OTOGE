// 設定定数
export const CONFIG = {
    NOTE_SPEED: 900,
    JUDGE_LINE_Y: 500,
    LANE_WIDTH: 80,
    LANE_COUNT: 4,
    START_DELAY: 2.0,
    JUDGE_WINDOW: {
        PERFECT: 0.050,
        GREAT:   0.100,
        BAD:     0.200
    },
    KEYS: ['d', 'f', 'j', 'k']
};

//譜面データ
export const SONGS = [
    {
        id: 'tutorial',
        title: 'Tutorial Beat',
        level: 'EASY',
        chart: [
            { time: 1.0, lane: 0 },
            { time: 2.0, lane: 1 },
            { time: 3.0, lane: 2 },
            { time: 4.0, lane: 3 },
        ]
    },
    {
        id: 'hardcore',
        title: 'Hardcore Mix',
        level: 'HARD',
        chart:[
    { time: 1.0, lane: 0 }, { time: 1.1, lane: 1 }, { time: 1.2, lane: 2 },
    { time: 1.3, lane: 3 }, { time: 1.4, lane: 2 }, { time: 1.5, lane: 1 },
    { time: 1.6, lane: 0 }, { time: 1.7, lane: 1 }, { time: 1.8, lane: 2 },
    { time: 1.9, lane: 3 }, 
    
    { time: 2.0, lane: 2 }, { time: 2.1, lane: 1 }, { time: 2.2, lane: 0 },
    { time: 2.3, lane: 1 }, { time: 2.4, lane: 2 }, { time: 2.5, lane: 3 },
    { time: 2.6, lane: 2 }, { time: 2.7, lane: 1 }, { time: 2.8, lane: 0 },
    { time: 2.9, lane: 1 }, 
    
    { time: 3.0, lane: 0 }, { time: 3.1, lane: 1 }, { time: 3.2, lane: 2 },
    { time: 3.3, lane: 1 }, { time: 3.4, lane: 0 }, { time: 3.5, lane: 1 },
    { time: 3.6, lane: 2 }, { time: 3.7, lane: 1 }, { time: 3.8, lane: 0 },
    { time: 3.9, lane: 1 }, 
    
    { time: 4.0, lane: 2 }, { time: 4.1, lane: 1 }, { time: 4.2, lane: 2 },
    { time: 4.3, lane: 3 }, { time: 4.4, lane: 2 }, { time: 4.5, lane: 1 },
    { time: 4.6, lane: 2 }, { time: 4.7, lane: 3 }, { time: 4.8, lane: 2 },
    { time: 4.9, lane: 1 }, 
    
    { time: 5.0, lane: 2 }, { time: 5.1, lane: 1 }, { time: 5.2, lane: 2 },
    { time: 5.3, lane: 1 }, { time: 5.4, lane: 2 }, { time: 5.5, lane: 1 },
    { time: 5.6, lane: 2 }, { time: 5.7, lane: 1 }, { time: 5.8, lane: 2 },
    { time: 5.9, lane: 1 }, 
    
    { time: 6.1, lane: 1 }, { time: 6.1, lane: 2 }, { time: 6.2, lane: 1 },
    { time: 6.2, lane: 2 }, { time: 6.3, lane: 0 }, { time: 6.3, lane: 3 },
    { time: 6.5, lane: 0 }, { time: 6.5, lane: 3 }, { time: 6.6, lane: 1 },
    { time: 6.6, lane: 2 }, { time: 6.7, lane: 0 }, { time: 6.7, lane: 3 }, 
            ]
    }
    
    
];