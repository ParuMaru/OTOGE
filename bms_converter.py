# bms_converter.py
import os
import json
import re
import glob

# 設定
SONGS_DIR = "assets/songs"
OUTPUT_LIST = "assets/song_list.json"

# BMSチャンネルマッピング (8ボタンモード: 皿+7鍵)
# 16:Scratch -> Lane 0
# 11-15,18-19: Keys -> Lane 1-7
BMS_LANE_MAP = {
    '16': 0, 
    '11': 1, '12': 2, '13': 3, '14': 4, '15': 5, '18': 6, '19': 7
}

def parse_bms(file_path, json_path):
    try:
        with open(file_path, 'r', encoding='shift_jis', errors='ignore') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Read error: {e}")
        return None

    header = { "title": "Unknown", "artist": "Unknown", "bpm": 130 }
    main_data = {}
    bpm_defs = {}
    
    for line in lines:
        line = line.strip()
        if not line.startswith('#'): continue
        
        if line.startswith('#TITLE'): header['title'] = line[6:].strip()
        elif line.startswith('#ARTIST'): header['artist'] = line[7:].strip()
        elif line.startswith('#BPM '): header['bpm'] = float(line[4:].strip())
        elif line.startswith('#BPM') and len(line.split()[0]) == 6:
            bpm_defs[line[4:6]] = float(line[6:].strip())
        elif ':' in line:
            cmd, val = line.split(':', 1)
            if len(cmd) == 6 and cmd[1:4].isdigit():
                measure = int(cmd[1:4])
                if measure not in main_data: main_data[measure] = []
                main_data[measure].append({ 'channel': cmd[4:6], 'data': val.strip() })

    sorted_measures = sorted(main_data.keys())
    if not sorted_measures: return None
    max_measure = sorted_measures[-1]
    
    notes = []
    bpm_events = [{'time': 0.0, 'bpm': header['bpm']}]
    current_bpm = header['bpm']
    current_time = 0.0
    
    for m in range(max_measure + 1):
        measure_len = 1.0
        events = []
        
        if m in main_data:
            for item in main_data[m]:
                if item['channel'] == '02': measure_len = float(item['data'])
                else:
                    total = len(item['data']) // 2
                    for i in range(total):
                        val = item['data'][i*2:i*2+2]
                        if val != '00':
                            events.append({ 'pos': i/total, 'ch': item['channel'], 'val': val })
        
        events.sort(key=lambda x: x['pos'])
        last_pos = 0.0
        measure_beats = 4.0 * measure_len
        
        for evt in events:
            dt = (evt['pos'] - last_pos) * measure_beats * (60.0 / current_bpm)
            current_time += dt
            last_pos = evt['pos']
            
            if evt['ch'] == '03':
                current_bpm = int(evt['val'], 16)
                bpm_events.append({'time': round(current_time, 4), 'bpm': current_bpm})
            elif evt['ch'] == '08' and evt['val'] in bpm_defs:
                current_bpm = bpm_defs[evt['val']]
                bpm_events.append({'time': round(current_time, 4), 'bpm': current_bpm})
            elif evt['ch'] in BMS_LANE_MAP:
                notes.append({
                    'time': round(current_time, 4),
                    'lane': BMS_LANE_MAP[evt['ch']],
                    'duration': 0
                })
        
        current_time += (1.0 - last_pos) * measure_beats * (60.0 / current_bpm)

    # JSON保存
    chart_data = {
        "bpm": header['bpm'],
        "offset": 0,
        "bpmEvents": bpm_events,
        "Hard": notes 
    }
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(chart_data, f, indent=2)

    return header

def convert_all_bms():
    song_list = []
    existing_list = []
    if os.path.exists(OUTPUT_LIST):
        with open(OUTPUT_LIST, 'r', encoding='utf-8') as f: existing_list = json.load(f)

    # 既存の曲リストをIDで管理
    existing_map = {s['id']: s for s in existing_list}

    for folder in os.listdir(SONGS_DIR):
        folder_path = os.path.join(SONGS_DIR, folder)
        if not os.path.isdir(folder_path): continue
        
        bms_files = glob.glob(os.path.join(folder_path, "*.bms")) + glob.glob(os.path.join(folder_path, "*.bme"))
        if not bms_files: continue
        
        print(f"Converting: {folder}")
        header = parse_bms(bms_files[0], os.path.join(folder_path, f"{folder}.json"))
        
        if header:
            audio_file = ""
            fmt = "mp3"
            for ext in ["mp3", "ogg", "wav"]:
                f = glob.glob(os.path.join(folder_path, f"*.{ext}"))
                if f: 
                    audio_file = os.path.basename(f[0])
                    fmt = ext
                    break
            
            song_info = {
                "id": folder,
                "folder": folder,
                "title": header['title'],
                "artist": header['artist'],
                "bpm": header['bpm'],
                "offset": 0,
                "difficulties": ["Hard"],
                "audioFile": audio_file,
                "format": fmt,
                "keyCount": 8  
            }
            existing_map[folder] = song_info # 上書きまたは追加

    with open(OUTPUT_LIST, 'w', encoding='utf-8') as f:
        json.dump(list(existing_map.values()), f, indent=2)
    print("Done.")

if __name__ == "__main__":
    convert_all_bms()