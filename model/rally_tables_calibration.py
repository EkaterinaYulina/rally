# -*- coding: utf-8 -*-
"""«Путь» v6: износ машины, задействованные флаги пролога/главы 6, сцена 4.2 как развилка.

Самодостаточный файл — не требует calib3.py. Печатает полный отчёт по перебору
всех 1 399 680 комбинаций выборов: баланс концовок, влияние каждого выбора на
исход, распределение мест по этапам, крест-таблицу «доверие × машина».

Тёмп Кравца на «Урале»/финале (48/22) и порог сцены 6.6 (🤝≥7, 🔧≥7, мягче
🔧≥6 при {принял_обе_правды}) сохранены с v5 без изменений — см.
claude/rally_vn_mehanika_igry.md, врезка «Что изменилось в v6».
"""
import itertools, random, statistics, bisect, json
from collections import Counter, defaultdict

# ---------------------------------------------------------------------------
# 1. Стартовый лист и фоновый перебор (было в calib3.py, инлайнено сюда)
# ---------------------------------------------------------------------------
POINTS=[25,18,15,12,10,8,6,4,2,1]
def pts(p): return POINTS[p-1] if p and p<=10 else 0
STAGES=["Ильмень","Рускеала","Печоры","Горный край","Урал","Ладожская Дуга"]
DATES=["17–18 апреля","5–6 июня","31 июля – 1 августа","28–29 августа","16–17 октября","6–7 ноября"]
REGION=["Новгородская обл.","Карелия","Псковская обл.","Кавказ","Свердловская обл.","Ленинградская обл."]
FAR=[False,False,False,True,True,False]
ALEX=4
F,R,D="fin","ret","dns"
SEED=20260926

# № пилот штурман команда база темп статусы по шести этапам
CORE=[
 (1,"Р. Кравец","Д. Ярцев","Балтик Моторспорт","СПб",15,[F,R,F,F,F,F]),
 (2,"А. Гущин","П. Рогов","Сибирь Моторспорт","Новосибирск",38,[F,R,R,F,F,F]),
 (3,"И. Стрельцов","Л. Бабин","Норд Ралли Тим","СПб",50,[F,F,R,F,F,F]),
 (5,"Ю. Мазур","И. Кот","Волга Спорт","Нижний Новгород",30,[F,F,R,R,F,R]),
 (21,"В. Лыков","А. Прошин","Ладога Ралли","СПб",66,[F,F,R,F,F,F]),
 (6,"Г. Сотников","Т. Раев",None,"СПб",88,[F,F,R,D,D,F]),
 (7,"Г. Соколов","А. Ким","Балтик Моторспорт","СПб",62,[F,F,R,F,F,F]),
 (8,"В. Плетнёв","О. Щукин","Сибирь Моторспорт","Новосибирск",106,[F,F,F,F,F,F]),
 (9,"М. Тихий","Е. Долин","Норд Ралли Тим","СПб",124,[F,F,R,F,R,F]),
 (10,"С. Бердов","Ю. Крапива","Волга Спорт","Нижний Новгород",148,[F,F,F,F,F,F]),
 (11,"Н. Голубь","Р. Заев",None,"СПб",168,[F,F,R,D,D,F]),
 (12,"А. Мельник","П. Сазонов",None,"СПб",193,[F,R,D,D,D,F]),
 (13,"Д. Хабаров","К. Юсов",None,"Псков",216,[F,F,F,D,D,F]),
 (14,"Л. Опарин","М. Гуня",None,"СПб",242,[F,F,F,D,D,F]),
 (15,"Т. Волошин","А. Берг",None,"Петрозаводск",268,[F,F,R,D,D,F]),
 (16,"С. Ланский","В. Терехов",None,"Великий Новгород",301,[D,F,R,D,D,F]),
 (17,"Ю. Кац","Д. Тиль",None,"СПб",334,[F,F,D,D,D,F]),
 (18,"О. Рыкова","М. Ланг",None,"СПб",372,[F,R,R,D,D,F]),
 (19,"П. Ушаков","И. Дробыш",None,"Мурманск",411,[R,F,F,D,D,F]),
 (20,"В. Носов","Э. Гринь",None,"Вологда",456,[F,D,F,D,D,F]),
]
# «Дикие карты» — местные экипажи, заявляются только на свой дальний этап
WILD={
 3:[(51,"А. Тлепсук","Р. Хачак",None,"Майкоп",45),
    (53,"Г. Багдасарян","С. Осипов",None,"Краснодар",70),
    (55,"Д. Ковач","Н. Лапин",None,"Ставрополь",98),
    (57,"Э. Мурзаев","Т. Сизов",None,"Нальчик",135),
    (59,"В. Чепурной","А. Рябов",None,"Сочи",205)],
 4:[(61,"П. Загорский","Е. Тютин",None,"Екатеринбург",44),
    (63,"А. Шаймуратов","Д. Кислов",None,"Уфа",64),
    (65,"Н. Опалев","Г. Тимин",None,"Челябинск",92),
    (67,"С. Бахарев","Л. Мосин",None,"Пермь",142),
    (69,"И. Дудин","К. Раев",None,"Тюмень",212)],
}
# Сюжетные дельты Кравца (авторские, без симуляции). Урал=48, финал=22 — темп
# не менялся с v5, см. врезку в мехднике о цене баланса концовок.
KRAV=[15,None,155,12,48,22]

def build(seed=SEED):
    rnd=random.Random(seed); crews={}; grid={}
    for num,p,s,t,base,pace,st in CORE:
        crews[num]=dict(n=num,p=p,s=s,t=t,base=base,pace=pace,wild=None)
        rows=[]
        for i in range(6):
            if st[i]!=F: rows.append((st[i],None)); continue
            d = KRAV[i] if num==1 else round(pace*rnd.uniform(.88,1.14)+rnd.gauss(0,9),1)
            rows.append((F,float(d)))
        grid[num]=rows
    for stage,lst in WILD.items():
        for num,p,s,t,base,pace in lst:
            crews[num]=dict(n=num,p=p,s=s,t=t,base=base,pace=pace,wild=stage)
            rows=[(D,None)]*6
            rows[stage]=(F,round(pace*rnd.uniform(.92,1.10)+rnd.gauss(0,7),1))
            grid[num]=rows
    return crews,grid
CREWS,GRID=build()
# Фиксированные дельты верхушки (сюжет) — перекрывают случайный фон
FIXDELTA={2:[38,None,None,26,16,34],3:[50,44,None,40,46,40],
          5:[30,22,None,None,38,None],7:[62,58,None,55,60,52]}
for n,row in FIXDELTA.items():
    for i,v in enumerate(row):
        if v is not None and GRID[n][i][0]==F: GRID[n][i]=(F,float(v))

TEAMS=defaultdict(list)
for nn,cc in CREWS.items():
    if cc["t"]: TEAMS[cc["t"]].append(nn)
TEAMS["Ладога Ралли"].append(ALEX)

# ---------------------------------------------------------------------------
# 2. Модель времени и константы (claude/rally_vn_mehanika_igry.md, разделы 1–3)
# ---------------------------------------------------------------------------
KT, KC = 6.0, 6.0            # цена пункта: доверие 6 сек, машина 6 сек
A0 = 8.0                     # базовый темп при 🤝10/🔧10
ROADPACE = 70.0              # 4.5-А, дорожный темп
BIAS=[3.0,-4.0,6.0,0.0,0.0,-3.0]
START_CAR, START_TRUST = 10, 3
WEAR = 1                     # износ после «Ильменя», «Рускеалы», «Урала»
TYRE = 2                     # 3.6: ±2
PEN45 = 4                    # 4.5-Б
THR45 = 3                    # сход при 🔧 ≤ 3
CAP_DROP, CAP_DROP_SAVED, CAP_DROP_RET = 1, 0, 3
G66_TRUST, G66_CAR, G66_CAR_SOFT = 7, 7, 6   # смягчается {принял_обе_правды}

# ---------------------------------------------------------------------------
# 3. Карта выборов v6 — 16 развилок (было 15 в v5: добавлена сц. 4.2)
# ---------------------------------------------------------------------------
OPTS=dict(c14="АБ",c23="АБВ",c32="АБ",c33="АБВ",c34="АБВ",c36="АБ",c37="АБВ",
          c41="АБВ",c42="АБ",c44="АБВ",c45="АБ",c52="АБ",c54="АБ",c55="АБВ",c63="АБВ",c66="АБ")
KEYS=list(OPTS)
def legal(ch):                      # 4.4-В доступен только при {не_сдал_назад}
    return not (ch["c44"]=="В" and ch["c14"]!="А")

def run(ch):
    trust,car=START_TRUST,START_CAR; naoral=False; flags=set(); loss=[0.0]*6; snap=[None]*6
    def T(d):
        nonlocal trust,naoral
        if d>0 and naoral: d-=1; naoral=False
        trust=max(0,min(10,trust+d))
    def C(d):
        nonlocal car; car=max(0,min(10,car+d))
    # Пролог — 1.4
    flags.add("не_сдал_назад" if ch["c14"]=="А" else "молчание")
    T({"А":2,"Б":-1,"В":1}[ch["c23"]]); T(1 if ch["c32"]=="А" else 0)
    if ch["c33"]=="А": T(-1); flags.add("штраф")
    elif ch["c33"]=="Б": loss[0]+=4
    else: T(1)
    snap[0]=(trust,car); C(-WEAR)                 # износ после «Ильменя»
    if ch["c34"]=="А": T(1)
    elif ch["c34"]=="В": T(-2); naoral=True
    if ch["c36"]=="А": C(TYRE); flags.add("резина")
    else: C(-TYRE)
    if ch["c37"]=="А": loss[1]+= 2 if trust>=5 else 6; T(1)
    elif ch["c37"]=="Б": loss[1]+=5; T(-1)
    else: loss[1]+=3; T(2)
    snap[1]=(trust,car); C(-WEAR)                 # износ после «Рускеалы»
    if ch["c41"]=="А": T(2); flags.add("честно_о_Кузнечном")
    elif ch["c41"]=="Б": T(1); flags.add("сомнение")
    if ch["c42"]=="А": flags.add("Денис_намекнул")     # v6: сц.4.2 — давить/отпустить
    if ch["c44"]=="А": C(2); loss[2]+=20
    elif ch["c44"]=="В": C(2)                     # {не_сдал_назад}: Толя верит на слово
    snap[2]=(trust,car); pre45=car; ret=False
    if ch["c45"]=="А": C(-3); T(1); loss[2]+=ROADPACE; flags.add("сберегли")
    else:
        C(-PEN45)
        if car<=THR45: ret=True; snap[2]=None
    drop = CAP_DROP_RET if ret else (CAP_DROP_SAVED if "сберегли" in flags else CAP_DROP)
    car=max(0,min(10,pre45-drop))                 # капиталка: предпечорское минус износ
    # 5.2: при {молчание} спонсор жёстче — блокирует один флаг, а не два
    if "молчание" in flags: blocked = ("штраф" in flags) or ("резина" in flags)
    else: blocked = ("штраф" in flags) and ("резина" in flags)
    if ch["c52"]=="А" and not blocked: C(2)
    if ch["c54"]=="А":
        C(0 if "молчание" in flags else 1)         # v6: {молчание} снимает бонус
        flags.add("честен_со_спонсором")
    T({"А":2,"Б":-1,"В":1}[ch["c55"]])
    snap[4]=(trust,car); C(-WEAR)                 # износ после «Урала»
    if ch["c63"]=="А":
        T(1 if "сомнение" in flags else 2); flags.add("принял_обе_правды")
    elif ch["c63"]=="Б":
        T(-2 if "Денис_намекнул" in flags else -1)  # v6: дороже, если знал и молчал
    else: T(1)
    crash=False
    need = G66_CAR_SOFT if "принял_обе_правды" in flags else G66_CAR
    if ch["c66"]=="Б":
        if trust>=G66_TRUST and car>=need: loss[5]-=1.5
        else: crash=True
    snap[5]=None if crash else (trust,car)
    return snap,loss,trust,car,crash,ret,flags

# ---------------------------------------------------------------------------
# 4. Перебор — фон отсортирован один раз на этап, вставка Алекса через bisect
# ---------------------------------------------------------------------------
def build_bg():
    per=[]
    for st in range(6):
        e=[]
        for n in GRID:
            k,d=GRID[n][st]
            if k!="fin": continue
            e.append((d,n))
        e.sort()
        per.append(e)
    return per
BG=build_bg()
DELT=[[d for d,_ in BG[st]] for st in range(6)]
_memo={}
def finish(key):
    if key in _memo: return _memo[key]
    P=defaultdict(lambda:[0]*6)
    for st,k in enumerate(key):
        if k is None:
            for i,(d,n) in enumerate(BG[st],1): P[n][st]=pts(i)
        else:
            for i,(d,n) in enumerate(BG[st],1):
                P[n][st]=pts(i if i<k else i+1)
            P[ALEX][st]=pts(k)
    tot=[(sum(P[n][:6]),n) for n in list(GRID)+[ALEX]]
    tot.sort(key=lambda x:(-x[0],x[1]))
    pos=[i for i,(p,x) in enumerate(tot,1) if x==ALEX][0]
    pre=[(sum(P[n][:5]),n) for n in list(GRID)+[ALEX]]
    pre.sort(key=lambda x:(-x[0],x[1]))
    mine=[p for p,x in pre if x==ALEX][0]; oth=max(p for p,x in pre if x!=ALEX)
    ts=sorted(((sum(sum(P[q]) for q in mem), t) for t,mem in TEAMS.items()), reverse=True)
    _memo[key]=(pos, oth-mine, ts[0][1]=="Ладога Ралли")
    return _memo[key]
def ev(ch):
    snap,loss,tr,car,crash,ret,flags=run(ch)
    key=[]
    for st in range(6):
        if snap[st] is None: key.append(None); continue
        t,c=snap[st]
        tm=A0+(10-t)*KT+(10-c)*KC+loss[st]+BIAS[st]
        key.append(bisect.bisect_left(DELT[st],tm)+1)
    pos,gap,lad=finish(tuple(key))
    e="В" if crash else ("А" if pos==1 else "Б" if pos==2 else "Г")
    return e,tr,car,crash,ret,gap,lad,key

COMBOS=[c for c in itertools.product(*[OPTS[k] for k in KEYS]) if legal(dict(zip(KEYS,c)))]
LAB={"c14":"1.4 пролог","c23":"2.3 встреча","c32":"3.2 о Кравце","c33":"3.3 ознакомление",
 "c34":"3.4 разбор СУ-1","c36":"3.6 резина","c37":"3.7 «потерялась»","c41":"4.1 тормоза",
 "c42":"4.2 Денис","c44":"4.4 сервис","c45":"4.5 мотор","c52":"5.2 доставка","c54":"5.4 Шестаков",
 "c55":"5.5 Вике","c63":"6.3 правда","c66":"6.6 риск"}

def report():
    N=len(COMBOS)
    print("Комбинаций:",N)
    res={}; cars=Counter(); rets=0; chains=set(); cross=Counter()
    gaps=[]; tc=Counter(); places={s:Counter() for s in range(6)}
    for cb in COMBOS:
        ch=dict(zip(KEYS,cb))
        e,tr,car,crash,ret,gap,lad,key=ev(ch)
        res[cb]=e; cars[car]+=1; gaps.append(gap); tc[(e=="А",lad)]+=1
        for st in range(6): places[st][key[st]]+=1
        if ret: rets+=1; chains.add((ch["c36"],ch["c44"],ch["c45"]))
        cross[(("🤝≥8" if tr>=8 else "🤝<8"),("🔧≥8" if car>=8 else "🔧<8"),e)]+=1
    end=Counter(res.values())
    dev=max(abs(v*100/N-25) for v in end.values())
    print("Концовки: "+"  ".join(f"{k} {v*100/N:.1f}%" for k,v in sorted(end.items()))+f"  | макс. отклонение {dev:.1f} п.п.")
    print(f"Сход «Печоры» {rets*100/N:.1f}% ({len(chains)} цепочк.) | 🔧 к финалу: "
          +", ".join(f"{k}:{v*100//N}%" for k,v in sorted(cars.items()))
          +f" → ≥8 в {sum(v for k,v in cars.items() if k>=8)*100/N:.0f}%")
    c1,c0=tc[(True,True)],tc[(True,False)]; d1,d0=tc[(False,True)],tc[(False,False)]
    print(f"Чемпион → командный зачёт Ладоги: {c1*100/(c1+c0):.1f}% | иначе {d1*100/(d1+d0):.1f}%"
          +f" | разрыв перед финалом: медиана {statistics.median(gaps):.0f}")
    for t in ["🤝≥8","🤝<8"]:
        row=[]
        for c in ["🔧≥8","🔧<8"]:
            tot=sum(v for (a,b,e),v in cross.items() if a==t and b==c)
            row.append(f"{c}: чемпион {cross.get((t,c,'А'),0)*100/tot:5.1f}% (путей {tot*100/N:4.1f}%)" if tot else f"{c}: —")
        print(f"  {t}  "+"  ".join(row))
    infl={}
    for k in KEYS:
        i=KEYS.index(k); ch_=0
        for cb in COMBOS:
            b=res[cb]
            for alt in OPTS[k]:
                if alt==cb[i]: continue
                c2=tuple(list(cb[:i])+[alt]+list(cb[i+1:]))
                if c2 in res and res[c2]!=b: ch_+=1; break
        infl[k]=ch_/N
    print("Влияние выбора на концовку:")
    for v,k in sorted(((v,k) for k,v in infl.items()), reverse=True):
        print(f"  {LAB[k]:20}{v*100:5.1f}%")
    for st in range(6):
        it=sorted((k if k is not None else 99,v) for k,v in places[st].items())
        print(f"  {STAGES[st]:17}"+", ".join(f"{'—' if k==99 else str(k)+'м'} {v*100//N}%" for k,v in it if v*100//N>0))

if __name__=="__main__":
    report()
