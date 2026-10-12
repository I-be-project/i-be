"""Reconcile the approved October 8 leaflet with CSV and DB, preserving QR codes.

Run without --apply to prepare/review the plan; --apply uses one DB transaction.
"""
import argparse
import asyncio
import csv
import json
import re
import secrets
from collections import Counter
from datetime import datetime
from pathlib import Path

import asyncpg

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "backend/scripts/booths.csv"
MAP = ROOT / "frontend/lib/boothMap.ts"
TITLES = {
    3: "AI(Tea) 소믈리에", 4: "무엇이든 집어내는 만능 집게", 5: "연구실에서 누가 돌아왔게~",
    6: "하늘을 날다, 항공기 개발자", 7: "디지털 세상의 심장, 반도체 설계 연구원",
    8: "질병에 맞서는 희망, 신약 개발자", 9: "AI와 함께 만드는 소프트웨어 개발자",
    10: "우주를 향한 꿈, 로켓 연구원", 11: "진로네비게이터", 12: "VR 세계여행·AR 우리 동네 그리기",
    13: "양력을 통해 날리는 비행기 만들기", 14: "드론 시뮬레이터", 15: "내 심장의 정보와 건강관리 인공지능",
    16: "어두워지면 켜지는 불빛!", 17: "증강현실로 보는 세포 티코스터!", 18: "돈 만드는 사람들",
    19: "곤충 월드 메이커! 생태 디오라마 제작소", 20: "나만의 SMART100 브릭 만들기",
    21: "구름의 원리를 파헤치기", 22: "Be the First! 반도체 창업으로 소통하기",
    23: "AI 향기 연구소: 나만의 향을 설계하다", 24: "AI에게 말하면 앱이 완성된다!", 25: "나의 아이디어가 특허가 된다고?",
    26: "스피치 ON", 27: "창의 ON", 28: "탐구 ON", 29: "도전 ON", 30: "마음 ON",
    31: "함께 ON", 32: "해결 ON", 33: "선택 ON", 34: "발견 ON", 35: "성장 ON",
    36: "6·25전사자 유해발굴 사진·유품전시회", 39: "대한민국 특전사",
    40: "꿈을 향한 도전! 해군과 함께하는 힘찬 항해", 41: "단 한번의 선택이 만드는 영원한 자부심",
    42: "제복UNIFORM, 미래를 FORM하다", 43: "대한민국의 안전, 대한민국의 경찰!",
    45: "심폐소생술 체험", 46: "또 하나의 국가대표! 슬기로운 교도관 체험", 47: "K-water 물드림 캠프",
    48: "향기석고 채색 놀이터", 49: "커피박과 자개의 빛나는 만남", 50: "실로 그려보는 펀치니들 동물 키링",
    51: "향기 담은 한복 방향제", 52: "소목장과 함께하는 목공 체험", 53: "내마음을 담는 워리스톤",
    54: "떡 위에 피는 꽃, 앙금플라워", 55: "전통을 담은 금박 댕기", 56: "마음을 잇는 전통매듭",
    57: "네모동글 삼색 강정만들기(전통간식)", 58: "자연소재만다라손수건 만들기",
    59: "천천히 정성껏 느리게 원목달력 만들기", 60: "버려진 유리가 책갈피가 되다!",
    61: "대전체력인증센터", 63: "유청수 활동 처방전", 64: "한기대, 일과 배움을 잇는 일학습병행 체험",
    65: "팝콘쌤들과 함께 만드는 비전키링", 66: "돌려라! 법무직업 룰렛, 잡(job)아라 미래!",
    67: "필로소퍼의 삶에 비춰본 나의 꿈·미래", 68: "17개의 꿈, 너의 미래를 디자인하라!",
    69: "내일의 내 일(My job)", 70: "대전광역시 건축사회", 72: "AI 조향·향기잡(Job)았다!",
    73: "캘리그라피마법족자", 74: "나만의 굿즈 스탬프 만들기", 75: "나만의 작은 숲, 테라리움 디자이너",
    76: "나만의 나무반지 만들기", 77: "슬랑이비누 직업체험소", 78: "나만의 새활용 다꾸",
    79: "패션디자이너체험", 80: "후우링 풍경만들기",
}
EXTRAS = [
    (11, "F", "진로네비게이터", "", "분야별 체험을 하고 미래 진로를 탐색하는 진로네비게이터 프로그램입니다.", "planning;self_understanding;thinking"),
    (70, "Y", "대전광역시 건축사회", "대전광역시 건축사회", "", "planning;thinking;creativity"),
    (80, "Y", "후우링 풍경만들기", "대전예술고등학교", "", "planning;self_understanding;creativity"),
    (101, "", "버찌책방 (생각의쉼)", "버찌책방", "", ""),
    (102, "", "버찌책방 (마음의쉼)", "버찌책방", "", ""),
    (103, "", "누노작가 (손끝의쉼)", "누노작가", "", ""),
    (104, "", "라스플로레스 (마음비움터)", "라스플로레스", "", ""),
    (105, "", "요게벳제이나인원 (후각의쉼)", "요게벳제이나인원", "", ""),
    (106, "", "초글 (촉각의쉼)", "초글", "", ""),
    (107, "", "아이도세라믹 (시각의쉼)", "아이도세라믹", "", ""),
    (108, "", "제이픽 (추억의사진관)", "제이픽", "", ""),
    (109, "", "작은 디자인 캠프", "대전광역시건축사회", "건축사와 함께 아이디어를 설계와 모형으로 옮기는 프로젝트입니다.", ""),
    (110, "", "도시 수선 프로젝트", "충남대학교 회화과", "예술가와 함께 예술로 도시 공간을 재구성하는 프로젝트입니다.", ""),
]


def prepare():
    rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig")))
    original_map = MAP.read_text(encoding="utf-8")
    mapping = {name: json.loads(numbers) for name, numbers in re.findall(r'  "([^"]+)": (\[[^\]]+\]|null),', original_map)}
    # Idempotence: canonical names are also accepted on subsequent runs.
    for name, numbers in list(mapping.items()):
        if numbers:
            mapping[TITLES.get(numbers[0], name)] = numbers
    aliases = {}
    order = {}
    for row in rows:
        old = row["name"]
        extra = next((entry for entry in EXTRAS if entry[2] == old), None)
        if extra:
            order[old] = extra[0]
            continue
        if old == "버츄얼 앵커 체험":
            row["name"] = "대전시청자미디어센터"
            aliases[old] = row["name"]
            order[row["name"]] = 100
            continue
        if old == "대전시청자미디어센터":
            order[old] = 100
            continue
        numbers = mapping[old]
        row["name"] = TITLES[numbers[0]]
        aliases[old] = row["name"]
        order[row["name"]] = numbers[0]
    existing_names = {r["name"] for r in rows}
    used = {r["code"] for r in rows}
    for number, zone, name, institution, detail, competencies in EXTRAS:
        if name in existing_names:
            continue
        code = ""
        while not code or code in used:
            code = "".join(secrets.choice("23456789ABCDEFGHJKMNPQRSTUVWXYZ") for _ in range(6))
        used.add(code)
        rows.append(dict(code=code, program_id="", zone=zone, name=name, description=institution, detail=detail, competencies=competencies))
        order[name] = number
    rows.sort(key=lambda r: order.get(r["name"], 999))
    return rows, aliases, original_map


async def reconcile(apply):
    rows, aliases, original_map = prepare()
    print("PLAN", len(rows), dict(Counter(r["zone"] or "other" for r in rows)))
    if not apply:
        return
    env = {}
    for line in (ROOT / "backend/.env").read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip().strip('"').strip("'")
    conn = await asyncpg.connect(env["DATABASE_URL"], timeout=15)
    try:
        async with conn.transaction():
            await conn.execute("lock table ops.booths in share row exclusive mode")
            before = await conn.fetch("select * from ops.booths")
            known = {r["code"] for r in rows}
            removed = [r for r in before if r["code"] not in known]
            assert all(r["code"] == "E2QG2K" for r in removed), "Unexpected extra DB booth; review required"
            backup = {"booths": [dict(r) for r in before], "competencies": [dict(r) for r in await conn.fetch("select * from ops.booth_competencies")], "removed_booth_visits": [dict(r) for r in await conn.fetch("select * from ops.booth_visits where booth_id = any($1::uuid[])", [r["id"] for r in removed])]}
            backup_dir = ROOT / "backend/tmp/leaflet-reconciliation"
            backup_dir.mkdir(parents=True, exist_ok=True)
            (backup_dir / f"before-{datetime.now():%Y%m%d-%H%M%S}.json").write_text(json.dumps(backup, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
            (backup_dir / f"before-{datetime.now():%Y%m%d-%H%M%S}.csv").write_bytes(CSV.read_bytes())
            for row in rows:
                result = await conn.fetchrow("""insert into ops.booths(code,name,description,detail,zone) values($1,$2,$3,$4,$5)
                    on conflict(code) do update set name=excluded.name,description=excluded.description,detail=excluded.detail,zone=excluded.zone,updated_at=now() returning id""", row["code"], row["name"], row["description"] or None, row["detail"] or None, row["zone"])
                await conn.execute("delete from ops.booth_competencies where booth_id=$1", result["id"])
                for competency in row["competencies"].split(";"):
                    if competency:
                        await conn.execute("insert into ops.booth_competencies(booth_id,competency) values($1,$2)", result["id"], competency)
            for row in removed:
                await conn.execute("delete from ops.booths where id=$1", row["id"])
            after = await conn.fetch("select code,name,zone from ops.booths")
            assert {(r['code'], r['name'], r['zone']) for r in after} == {(r['code'], r['name'], r['zone']) for r in rows}
        with CSV.open("w", encoding="utf-8", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=["code", "program_id", "zone", "name", "description", "detail", "competencies"])
            writer.writeheader()
            writer.writerows(rows)
        # Preserve legacy aliases while adding the leaflet's canonical names.
        additions = []
        for old, new in aliases.items():
            match = re.search(r'  "' + re.escape(old) + r'": (\[[^\]]+\]|null),', original_map)
            if match and not re.search(r'  "' + re.escape(new) + r'":', original_map):
                additions.append(f'  {json.dumps(new, ensure_ascii=False)}: {match.group(1)},')
        for number, name in [(11, TITLES[11]), (70, TITLES[70]), (80, TITLES[80])]:
            if not re.search(r'  "' + re.escape(name) + r'":', original_map):
                additions.append(f'  {json.dumps(name, ensure_ascii=False)}: {[70,71] if number == 70 else [number]},')
        original_map = original_map.replace("const MAP_NUMBERS: Record<string, number[] | null> = {", "const MAP_NUMBERS: Record<string, number[] | null> = {\n" + "\n".join(additions))
        MAP.write_text(original_map, encoding="utf-8")
        print("APPLIED", len(after), "removed", [r["name"] for r in removed], "removed_visit_count", len(backup["removed_booth_visits"]))
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    asyncio.run(reconcile(parser.parse_args().apply))
