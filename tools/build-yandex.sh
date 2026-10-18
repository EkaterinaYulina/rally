#!/usr/bin/env bash
# Сборка для Яндекс Игр: dist-yandex/ и rally-yandex.zip в корне репозитория.
# Что отличается от рабочей версии:
#   - подключён /sdk.js (его отдаёт сама платформа, в файлах его нет);
#   - window.VN_PROD = true: нет кнопки «Назад», отладочных параметров (?s, ?f, ?end, ?adtest …) и шага назад по клавише ←;
#   - в архив не попадают служебные файлы (README, model, tools, .git).
# Запуск из корня репозитория:  bash tools/build-yandex.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist-yandex
rm -rf "$OUT" rally-yandex.zip
mkdir -p "$OUT"
cp -r index.html style.css fonts.css fonts assets js "$OUT"/
python3 - "$OUT/index.html" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf8').read()
# кнопка «Назад» — техническая, только для вычитки
s, n = re.subn(r'\s*<button class="sndbtn backbtn" id="backbtn".*?</button>', '', s, flags=re.S)
assert n == 1, 'кнопка Назад не найдена'
# флаг сборки и SDK платформы — перед остальными скриптами
flag = '<script>window.VN_PROD = true;</script>\n<script src="/sdk.js"></script>\n'
assert '<script src="js/rally-data.js">' in s
s = s.replace('<script src="js/rally-data.js">', flag + '<script src="js/rally-data.js">', 1)
open(p, 'w', encoding='utf8').write(s)
PY
find "$OUT" -name '.DS_Store' -delete
(cd "$OUT" && zip -qr ../rally-yandex.zip .)
echo "Готово: rally-yandex.zip ($(du -h rally-yandex.zip | cut -f1)), файлов: $(find "$OUT" -type f | wc -l)"
