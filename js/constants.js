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
    KEYS: ['d', 'f', 'j', 'k'],
    SONG_BASE_PATH: 'assets/songs/'
};

//譜面データ
export const SONGS = [
    {
        id: 'tsuki_to_okami',
        title: '月と狼',
        level: 'HARD',
        folder: 'tsuki_to_okami',
        offset: 0,
        bpm: 158,
    }
];