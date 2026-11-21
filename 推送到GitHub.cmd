@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在把 Joel Desk Pro v1.4.3 推送到 GitHub ...
git add -A
git commit -m "v1.4.3: 下载页新增「从 GitHub 下载 TDM Fast」按钮（校验 SHA256，自动写入 TDM 路径）"
git push origin main
echo.
echo 完成。GitHub 会自动打包新版安装包（约 5-10 分钟）。
pause
