import type { ProfileBoothStatus, ProfilePersona } from "./api";
import { competencyLabel } from "./competencies";

// 현재 API에는 추천 카테고리 ID가 없어 페르소나의 분야·키워드를 부스 설명과 매칭한다.
export function recommendBooths(booths: ProfileBoothStatus[], persona: ProfilePersona | null) {
  if (!persona) return [];
  const terms = [...new Set([...persona.fields, ...persona.keywords].flatMap((word) => word.toLowerCase().split(/[\s,·/]+/)).filter((word) => word.length > 1))];
  return booths.map((booth) => {
    const text = [booth.name, booth.description ?? "", ...(booth.competencies ?? []).map(competencyLabel)].join(" ").toLowerCase();
    const matches = terms.filter((term) => text.includes(term));
    return { booth, matches };
  }).filter(({ matches }) => matches.length > 0)
    .sort((a, b) => Number(a.booth.visited) - Number(b.booth.visited) || b.matches.length - a.matches.length)
    .slice(0, 3).map(({ booth }) => booth);
}
