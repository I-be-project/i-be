"use client";

// 학교 선택: 입력창에서 바로 검색하는 타입어헤드.
// 학교급(중/고)은 상위(IdentityFields)가 소유하고, 여기서는 그 학교급 안에서만 검색한다.
// 입력창에 학교명을 타이핑하면 아래 목록이 실시간 필터링되고, 선택하면 확정된다.
// 선택 결과는 학교명 문자열로, 백엔드 식별 키(school)로 그대로 사용된다.

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SCHOOLS } from "@/lib/data/schools";

type Level = "중학교" | "고등학교";

interface SchoolSelectProps {
  /** 상위(IdentityFields)가 소유하는 학교급 */
  level: Level;
  /** 선택된 학교명 (백엔드 식별 키) */
  value: string;
  onChange: (school: string) => void;
  disabled?: boolean;
}

const inputClass =
  "h-13 w-full rounded-2xl border border-transparent bg-zinc-100 px-4 text-base shadow-none outline-hidden transition-colors focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50";

export function SchoolSelect({ level, value, onChange, disabled }: SchoolSelectProps) {
  // 입력창 텍스트 (검색어). 포커스 중에만 사용하고, 비포커스 땐 확정된 value를 보여준다.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // 포커스 후 사용자가 타이핑했는지 — 타이핑 전엔 전체 목록(둘러보기), 타이핑하면 필터.
  const [typed, setTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filtered = SCHOOLS.filter(
    (s) =>
      s.level === level &&
      (!typed || s.name.includes(query.trim())),
  );

  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    setOpen(true);
    setQuery(value);
    setTyped(false);
    // 기존 선택 텍스트를 전체 선택해, 바로 타이핑하면 교체되도록.
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const handleBlur = () => {
    // 목록 항목 클릭이 먼저 처리되도록 약간 지연 후 닫는다 (선택 없으면 value로 복귀).
    blurTimer.current = setTimeout(() => {
      setOpen(false);
      setTyped(false);
    }, 120);
  };

  const handleSelect = (name: string) => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(name);
    setOpen(false);
    setTyped(false);
    inputRef.current?.blur();
  };

  return (
    <div className="space-y-2">
      {/* "학교" 라벨 */}
      <span className="text-sm font-bold text-zinc-600">학교</span>

      {/* 입력=검색 타입어헤드 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : value}
          onChange={(e) => {
            setQuery(e.target.value);
            setTyped(true);
            if (!open) setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={`${level} 이름 검색`}
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />

        {open && (
          <ul className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg shadow-zinc-200/50">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-zinc-400">
                검색 결과가 없어
              </li>
            ) : (
              filtered.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    // blur보다 먼저 선택을 처리해 항목 클릭이 무시되지 않도록.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(s.name);
                    }}
                    className={cn(
                      "block w-full truncate rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-zinc-100",
                      value === s.name
                        ? "font-bold text-sky-600"
                        : "text-zinc-700",
                    )}
                  >
                    {s.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
