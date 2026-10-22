#!/usr/bin/env bash
# Сборка для ВКонтакте (VK Mini Apps): dist-vk/ и rally-vk.zip в корне репозитория.
# Что отличается от рабочей версии:
#   - подключён VK Bridge (vendor/vk-bridge.min.js, лежит в архиве — внешних запросов нет);
#   - вместо js/ads.js работает js/ads-vk.js (VKWebAppInit, реклама между главами, пауза при сворачивании);
#   - js/vk-boot.js: прогресс игрока хранится в хранилище VK Bridge (переходит между устройствами), а не только в localStorage;
#   - window.VN_PROD = true: нет кнопок «Назад» и «Маршрутный лист», отладочных параметров (?s, ?f, ?end, ?adtest …) и шага назад по клавише ←;
#   - в архив не попадают служебные файлы (README, model, tools, .git, ads.js).
# Запуск из корня репозитория:  bash tools/build-vk.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=dist-vk
rm -rf "$OUT" rally-vk.zip
mkdir -p "$OUT/js" "$OUT/vendor"
cp -r index.html style.css fonts.css fonts assets "$OUT"/
cp js/*.js "$OUT/js/"
rm "$OUT/js/ads.js"
cp vendor/vk-bridge.min.js vendor/LICENSE-vk-bridge.txt "$OUT/vendor/"
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
# флаг сборки и VK Bridge — перед остальными скриптами
flag = '<script>window.VN_PROD = true;</script>\n<script src="vendor/vk-bridge.min.js"></script>\n'
assert '<script src="js/rally-data.js">' in s
s = s.replace('<script src="js/rally-data.js">', flag + '<script src="js/rally-data.js">', 1)
# main.js, cover-fx.js и ads-vk.js подключает js/vk-boot.js — после того как из хранилища VK Bridge подтянется прогресс игрока
tail = '<script src="js/main.js"></script>\n<script src="js/cover-fx.js"></script>\n<script src="js/ads.js"></script>'
assert tail in s, 'блок скриптов main/cover-fx/ads не найден'
s = s.replace(tail, '<script src="js/vk-boot.js"></script>', 1)
open(p, 'w', encoding='utf8').write(s)
PY
find "$OUT" -name '.DS_Store' -delete
(cd "$OUT" && zip -qr ../rally-vk.zip .)
echo "Готово: rally-vk.zip ($(du -h rally-vk.zip | cut -f1)), файлов: $(find "$OUT" -type f | wc -l)"
