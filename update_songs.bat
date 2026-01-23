@echo off
chcp 65001 > nul
cd /d %~dp0

echo ==========================================
echo AUTO_manager を実行します...
echo ==========================================

python auto_manager.py

echo.
echo ==========================================
echo 処理が完了しました。
echo 何かキーを押すと終了します...
pause > nul