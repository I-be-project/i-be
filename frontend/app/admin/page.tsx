"use client";

import { Eye, EyeOff, Inbox, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { StudentDetailDialog } from "@/components/admin/StudentDetailDialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

function StudentAvatar({ student }: { student: AdminStudentItem }) {
  if (student.photo_url) {
    return (
      // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={student.photo_url}
        alt={student.name}
        className="size-10 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border">
      {student.name.slice(0, 1)}
    </span>
  );
}

function ConsentTag({ agreed }: { agreed: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        className={
          agreed
            ? "size-1.5 rounded-full bg-emerald-500"
            : "size-1.5 rounded-full bg-muted-foreground/40"
        }
        aria-hidden
      />
      <span className={agreed ? "text-foreground" : "text-muted-foreground"}>
        {agreed ? "동의" : "미동의"}
      </span>
    </span>
  );
}

export default function AdminStudentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminStudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
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
      setLoading(true);
      try {
        const res = await fetchAdminStudents(token, {
          q: q || undefined,
          limit: 200,
        });
        setItems(res.items);
        setTotal(res.total);
        setError(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "목록을 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    // 마운트 시 1회 초기 로드. load는 router에만 의존하는 안정 콜백.
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
    <div className="min-h-screen bg-muted/40">
      <AdminHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        {/* 페이지 헤더 */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              회원 관리
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">
              가입 회원
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              회원가입한 모든 학생의 정보와 사진을 확인합니다.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-sm">
            <span className="tabular-nums">{total}</span>
            <span className="text-muted-foreground">명</span>
          </span>
        </div>

        {/* 검색 */}
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            load(query);
          }}
        >
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="이름 검색"
              placeholder="이름으로 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </form>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 회원 테이블 */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-14 pl-5">사진</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>학교</TableHead>
                <TableHead>학년·반·번호</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>비밀번호</TableHead>
                <TableHead className="pr-5">동의</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-5">
                      <Skeleton className="size-10 rounded-full" />
                    </TableCell>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Inbox className="size-8" aria-hidden />
                      <p className="text-sm">
                        {query
                          ? "검색 결과가 없습니다."
                          : "아직 가입한 회원이 없습니다."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell className="pl-5">
                      <StudentAvatar student={s} />
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.school}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {s.grade}학년 {s.class_no}반 {s.student_no}번
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label={
                          revealed.has(s.id) ? "비밀번호 숨기기" : "비밀번호 보기"
                        }
                        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 font-mono text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => toggleReveal(s.id)}
                      >
                        {revealed.has(s.id) ? (
                          <>
                            <span className="text-foreground">{s.password}</span>
                            <EyeOff className="size-3.5" aria-hidden />
                          </>
                        ) : (
                          <>
                            <span>••••••</span>
                            <Eye className="size-3.5" aria-hidden />
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="pr-5">
                      <ConsentTag agreed={s.consent_privacy} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      <StudentDetailDialog student={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
