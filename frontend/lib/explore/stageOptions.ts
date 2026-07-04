/** Q8/Q9 LLM 응답 → ChoiceRow 옵션 정규화 */

export interface StageChoiceOption {
  option_id: string;
  student_title: string;
  student_description: string;
}

type LegacyChip = { chip_id: string; text: string };

type Q8Like = {
  options?: StageChoiceOption[];
  word_chips?: LegacyChip[];
};

type Q9Like = {
  options?: StageChoiceOption[];
  topic_chips?: LegacyChip[];
};

export function normalizeStageOptions(data: Q8Like | Q9Like): StageChoiceOption[] {
  if (data.options?.length) return data.options;
  const chips =
    "word_chips" in data && data.word_chips
      ? data.word_chips
      : "topic_chips" in data
        ? data.topic_chips
        : [];
  return (chips ?? []).map((c) => ({
    option_id: c.chip_id,
    student_title: c.text,
    student_description: "",
  }));
}
