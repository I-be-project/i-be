-- ops 스키마 — 부스와 NCS 직업기초능력 역량의 연결.
--
-- 부스 하나에 역량 여럿, 역량 하나에 부스 여럿이라 연결 테이블로 둔다.
-- 컬럼 3개로 두면 "이 역량을 다루는 부스" 조회가 3열 OR이 되고 개수가 바뀔 때 스키마가 또 바뀐다.
--
-- "정확히 3개"는 제약으로 걸지 않는다. 역량체험 부스는 1개고, 주최측 매핑 자료가 오기
-- 전에는 0개다. 개수 규칙은 시드 스크립트(scripts/seed_booths.py)가 검사한다.
-- 제약은 언제나 참인 것만 담아야 한다.
--
-- 역방향 인덱스(competency 단독)는 두지 않는다. 부스 70개 × 역량 3개로 200행 미만이다.
-- 역량 목록은 app/core/competencies.py와 같아야 한다 — 값을 고칠 때 둘 다 고친다.

create schema if not exists ops;

create table if not exists ops.booth_competencies (
    booth_id   uuid not null references ops.booths (id) on delete cascade,
    competency text not null check (competency in (
        'communication', 'creativity', 'analysis', 'challenge', 'empathy',
        'collaboration', 'thinking', 'judgment', 'self_understanding', 'planning'
    )),
    primary key (booth_id, competency)
);
