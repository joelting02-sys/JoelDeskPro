@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "v1.4.10: 下载包升级为零厂商标识版本（解析内核清单改走自有 GitHub）"
git push origin main
echo GitHub will auto-build the new installer (about 5-10 minutes)
