// 참여 기록을 날짜별로 묶는다 — 성장 탭의 체험 일지가 날짜 하나에 부스 여러 개를 쌓아 보여준다.

type Visit = { visited_at?: string | null };

export interface VisitDay<T> {
  /** 묶음 키(YYYY-MM-DD, 기기 시간대 기준). */
  key: string;
  month: number;
  day: number;
  /** 요일 한 글자(일~토). */
  weekday: string;
  visits: T[];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * visited_at 기준으로 날짜별로 묶는다. 입력 순서(최근 먼저)를 날짜 안팎 모두 그대로 유지한다.
 * visited_at이 없는 기록은 날짜를 알 수 없어 뺀다.
 */
export function groupVisitsByDay<T extends Visit>(visits: readonly T[]): VisitDay<T>[] {
  const days = new Map<string, VisitDay<T>>();
  for (const visit of visits) {
    if (!visit.visited_at) continue;
    const at = new Date(visit.visited_at);
    if (Number.isNaN(at.getTime())) continue;
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
    let day = days.get(key);
    if (!day) {
      day = { key, month: at.getMonth() + 1, day: at.getDate(), weekday: WEEKDAYS[at.getDay()], visits: [] };
      days.set(key, day);
    }
    day.visits.push(visit);
  }
  return [...days.values()];
}
