import re
import json
import sys
import os

def parse_sm(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # 1. BPMを取得 (例: #BPMS:0.000=170.000;)
    # ※変速がある場合も、とりあえずメインのBPM(最初の値)を取得します
    bpm_match = re.search(r"#BPMS:.*?=(\d+(\.\d+)?);", content)
    bpm = float(bpm_match.group(1)) if bpm_match else 120.0
    print(f"Detected BPM: {bpm}")

    # 2. OFFSETを取得 (例: #OFFSET:-0.012;)
    # SMのOFFSETは「0拍目の開始時刻(秒)」を表す
    offset_match = re.search(r"#OFFSET:(-?\d+(\.\d+)?);", content)
    sm_offset = float(offset_match.group(1)) if offset_match else 0.0
    print(f"Detected Offset: {sm_offset}")

    # 3. ノーツデータ(#NOTES)を探す
    # #NOTES:
    #      type,
    #      desc,
    #      difficulty,
    #      meter,
    #      radar,
    #      notedata;
    raw_notes = re.findall(r"#NOTES:(.*?);", content, re.DOTALL)
    
    if not raw_notes:
        print("Error: No notes found in .sm file")
        return []

    # 複数の難易度がある場合、一番ノーツ数(行数)が多いもの＝難しい譜面 を自動採用するロジック
    target_note_data = ""
    max_lines = 0

    for section in raw_notes:
        parts = section.strip().split(':')
        data_part = parts[-1] # 一番最後が譜面データ
        line_count = len(data_part)
        if line_count > max_lines:
            max_lines = line_count
            target_note_data = data_part

    # --- パース処理開始 ---
    notes_list = []
    measures = target_note_data.strip().split(',') # 小節ごとに分割
    
    current_time = -sm_offset # 開始時刻をオフセットで補正
    seconds_per_beat = 60.0 / bpm # 1拍の秒数

    for measure in measures:
        lines = measure.strip().split()
        # コメント行を除去
        lines = [l for l in lines if not l.startswith('//') and len(l) >= 4]
        
        if not lines: continue

        division = len(lines) # 分割数 (4=4分, 8=8分, 16=16分...)
        # 1行あたりの時間 = (4拍 / 分割数) * 1拍の秒数
        time_per_line = (4.0 / division) * seconds_per_beat
        
        for i, line in enumerate(lines):
            # line は "0010" のような文字列
            for lane, char in enumerate(line):
                if lane >= 4: break # 4レーンまで

                # '1'=通常, '2'=ロング始点, '4'=ロング終点, 'M'=マイン
                # 今回はタップ(1)とロング始点(2)を通常のノーツとして扱う
                if char in ['1', '2', 'M']:
                    note_time = current_time + (i * time_per_line)
                    
                    # 少数第3位で丸める
                    note_time = round(note_time, 3)
                    
                    if note_time >= 0:
                        notes_list.append({
                            "time": note_time,
                            "lane": lane
                        })
        
        # 次の小節へ (1小節は4拍)
        current_time += 4.0 * seconds_per_beat

    return notes_list

# --- 実行部分 ---
if __name__ == "__main__":
    # 引数があればそれを使う、なければテスト用パス
    target_file = sys.argv[1] if len(sys.argv) > 1 else "assets/songs/tsuki_to_okami/chart.sm"

    if not os.path.exists(target_file):
        print(f"File not found: {target_file}")
        print("Usage: python sm_converter.py [path_to_sm_file]")
        sys.exit()

    print(f"Converting: {target_file}")
    final_notes = parse_sm(target_file)
    
    # JSON保存
    output_path = target_file.replace(".sm", ".json")
    json_data = { "notes": final_notes }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=2)

    print(f"Done! Saved to: {output_path}")
    print(f"Total Notes: {len(final_notes)}")