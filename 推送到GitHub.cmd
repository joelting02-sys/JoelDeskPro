@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在把 Joel Desk Pro v1.4.2 推送到 GitHub ...
git add -A
git commit -m "v1.4.2: 转录引擎完整内置 + 修复闲置自动关机误触发"
git push origin main
echo.
echo 完成。GitHub 会自动打包新版安装包（约 5-10 分钟）。
pause
