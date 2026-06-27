"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StudentDetailDialog } from "@/components/admin/StudentDetailDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, fetchAdminStudents, type AdminStudentItem } from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";

export default function AdminStudentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminStudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      const token = getAdminToken();
      if (!token) {
        router.replace("/admin/login");
        return;
      }
      try {
        const res = await fetchAdminStudents(token, { q: q || undefined, limit: 200 });
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다.");
      }
    },
    [router]
  );

  useEffect(() => {
    // load는 내부에서 setState를 호출하지만, 외부 API 데이터 동기화 목적이므로 허용.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("");
  }, [load]);

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">회원 관리</h1>
        <span className="text-sm text-muted-foreground">총 {total}명</span>
      </div>

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          load(query);
        }}
      >
        <Input
          placeholder="이름 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit">검색</Button>
      </form>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>사진</TableHead>
            <TableHead>이름</TableHead>
            <TableHead>학교</TableHead>
            <TableHead>학년/반/번호</TableHead>
            <TableHead>가입일</TableHead>
            <TableHead>비밀번호</TableHead>
            <TableHead>동의</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                회원이 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            items.map((s) => (
              <TableRow
                key={s.id}
                className="cursor-pointer"
                onClick={() => setSelected(s)}
              >
                <TableCell>
                  {s.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.photo_url}
                      alt={s.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                      無
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.school}</TableCell>
                <TableCell>
                  {s.grade}/{s.class_no}/{s.student_no}
                </TableCell>
                <TableCell>
                  {new Date(s.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="flex items-center gap-1 font-mono"
                    onClick={() => toggleReveal(s.id)}
                  >
                    {revealed.has(s.id) ? (
                      <>
                        {s.password} <EyeOff className="h-4 w-4" />
                      </>
                    ) : (
                      <>
                        •••••• <Eye className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </TableCell>
                <TableCell>{s.consent_privacy ? "O" : "X"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <StudentDetailDialog student={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
