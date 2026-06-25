#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Node.js required: https://nodejs.org"; read -n1 -s; exit 1; }
echo "Skills Manager - 켜는 중... 브라우저가 열립니다."
node server/index.js
