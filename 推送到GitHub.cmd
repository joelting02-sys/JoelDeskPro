@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在把 Joel Desk Pro v1.4.4 推送到 GitHub ...
git add -A
git commit -m "v1.4.4: 下载页改用自有品牌 JoelFast（GitHub 下载按钮 + 界面文案 + 自动识别）"
git push origin main
echo.
echo 完成。GitHub 会自动打包新版安装包（约 5-10 分钟）。
pause
