import re
import json
import sys
import os

def parse_sm(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return []

    # --- 1. BPMを取得 ---
    # 形式: #BPMS:0.000=158.000,...;
    bpm_match = re.search(r'#BPMS:(.*?);', content, re.DOTALL)
    if not bpm_match:
        print("Error: BPM not found")
        return []
    
    # 簡易対応: 最初のBPMだけを取得（変速なし前提）
    first_bpm_str = bpm_match.group(1).split(',')[0].strip() # 例: 0.000=158.000
    if '=' in first_bpm_str:
        bpm = float(first_bpm_str.split('=')[1])
    else:
        bpm = 120.0 # フォールバック
    
    print(f"Detected BPM: {bpm}")

    # --- 2. NOTESセクションを取得 ---
    # 難易度ごとに分かれているので、"dance-single:" の後の数字の羅列を探す
    # (複数ある場合は、一番ノーツ数が多いもの=HARDなどを簡易的に選ぶロジックにするか、最初に見つかったものを採用)
    
    # StepManiaのNOTES形式:
    # #NOTES:
    #      type:
    #      desc:
    #      difficulty:
    #      meter:
    #      radar:
    #      NoteData;
    
    # 正規表現で NoteData 部分を抽出
    notes_sections = re.findall(r'#NOTES:[\s\S]*?;', content)
    
    if not notes_sections:
        print("Error: NOTES section not found")
        return []

    # とりあえず最後のセクション（通常は一番高難易度）を使用
    target_section = notes_sections[-1]
    
    # 最後のコロン(:)からセミコロン(;)までが譜面データ
    raw_notes_data = target_section.split(':')[-1].strip().rstrip(';')
    
    measures = raw_notes_data.split(',')
    parsed_notes = []
    
    # ホールド計算用: { レーン番号: 開始時間 }
    active_holds = {} 

    current_time = 0.0
    
    for measure in measures:
        lines = measure.strip().split()
        if not lines: continue
        
        # この小節の分解能 (4行なら4分音符、16行なら16分音符)
        divisions = len(lines)
        # 1行あたりの時間(秒) = (60 / BPM * 4拍) / 行数
        seconds_per_line = (240.0 / bpm) / divisions

        for line in lines:
            # line は "0000" や "1002" など
            # クォート除去などのクリーンアップ
            line = line.strip()
            
            # コメント対策（//以降は無視）
            if '//' in line:
                line = line.split('//')[0]

            if len(line) < 4: continue

            for lane, char in enumerate(line):
                # 0:なし, 1:通常, 2:ホールド開始, 3:ホールド終了, M:地雷
                
                if char == '1': # 通常ノーツ (Tap)
                    parsed_notes.append({
                        "time": round(current_time, 3),
                        "lane": lane,
                        "duration": 0
                    })
                    
                elif char == '2': # ホールド開始 (Hold Head)
                    active_holds[lane] = current_time
                    
                elif char == '3': # ホールド終了 (Hold Tail)
                    if lane in active_holds:
                        start_time = active_holds.pop(lane)
                        duration = current_time - start_time
                        
                        # duration付きのノーツとして追加
                        parsed_notes.append({
                            "time": round(start_time, 3), # 開始時間を登録
                            "lane": lane,
                            "duration": round(duration, 3)
                        })

            current_time += seconds_per_line

    # 時間順にソート
    parsed_notes.sort(key=lambda x: x['time'])
    
    return parsed_notes

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python sm_converter.py <chart.sm>")
        print("Example: python sm_converter.py assets/songs/song1/chart.sm")
        sys.exit(1)
        
    input_path = sys.argv[1]
    
    # 出力パス: 入力と同じフォルダの chart.json
    folder = os.path.dirname(input_path)
    output_path = os.path.join(folder, 'chart.json')

    print(f"Reading: {input_path}")
    notes = parse_sm(input_path)
    
    if not notes:
        print("No notes found or error occurred.")
        sys.exit(1)

    output_data = {
        "notes": notes
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2)
        
    print(f"Success! Converted {len(notes)} notes.")
    print(f"Saved to: {output_path}")