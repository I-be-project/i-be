-- generated.answers.stage 에 'q1to6' 허용 추가.
--
-- 0004는 Q7~9만 단계별로 저장했다. Q1~6(RIASEC 미션)의 결과도 저장하기 위해
-- 'q1to6' stage를 한 행으로 저장한다(6개 답변 + 산출된 riasec/pairCode를 payload에).
-- Q6를 마치는 순간 한 번에 저장되며, 그 시점에 in_progress 세션이 만들어진다.

alter table generated.answers
    drop constraint if exists answers_stage_check;

alter table generated.answers
    add constraint answers_stage_check
    check (stage in ('q1to6', 'q7a', 'q7b', 'q8', 'q9'));
