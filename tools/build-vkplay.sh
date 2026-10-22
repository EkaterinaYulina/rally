#!/usr/bin/env bash
# Сборка для VK Play (iframe): dist-vkplay/ и rally-vkplay.zip в корне репозитория.
# Что отличается от рабочей версии:
#   - window.VN_PROD = true: нет кнопок «Назад» и «Маршрутный лист», отладочных параметров (?s, ?f, ?end, ?adtest …) и шага назад по клавише ←;
#   - никаких SDK не подключено (ни /sdk.js Яндекса, ни VK Bridge): js/ads.js без SDK рекламу не показывает, игра идёт как есть;
#   - в архив не попадают служебные файлы (README, model, tools, .git).
# Результат — статика: её выкладывают на хостинг, а ссылку вставляют в поле «IFrame ссылка на игру» (с ?version=1).
# Запуск из корня репозитория:  bash tools/build-vkplay.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist-vkplay
rm -rf "$OUT" rally-vkplay.zip
mkdir -p "$OUT"
cp -r index.html style.css fonts.css fonts assets js "$OUT"/
python3 - "$OUT/index.html" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf8').read()
# кнопка «Назад» — техническая, только для вычитки
s, n = re.subn(r'\s*<button class="sndbtn backbtn" id="backbtn".*?</button>', '', s, flags=re.S)
assert n == 1, 'кнопка Назад не найдена'
# маршрутный лист — отладочный список сцен: кнопки нет (клавиша M отключена флагом VN_PROD)
s, n = re.subn(r'\s*<button class="roadbook" id="roadbook".*?</button>', '', s, flags=re.S)
assert n == 1, 'кнопка Маршрутный лист не найдена'
# флаг сборки — перед остальными скриптами
flag = '<script>window.VN_PROD = true;</script>\n'
assert '<script src="js/rally-data.js">' in s
s = s.replace('<script src="js/rally-data.js">', flag + '<script src="js/rally-data.js">', 1)
# в сборке не должно остаться ссылок на SDK
assert '/sdk.js' not in s and 'vk-bridge' not in s
open(p, 'w', encoding='utf8').write(s)
PY
find "$OUT" -name '.DS_Store' -delete
(cd "$OUT" && zip -qr ../rally-vkplay.zip .)
echo "Готово: rally-vkplay.zip ($(du -h rally-vkplay.zip | cut -f1)), файлов: $(find "$OUT" -type f | wc -l)"
