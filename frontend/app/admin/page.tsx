"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Inbox,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { StudentDetailSidebar } from "@/components/admin/StudentDetailSidebar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  bulkDeleteAdminStudents,
  createAdminTestStudent,
  fetchAdminSchools,
  fetchAdminStudentPhotoUrl,
  fetchAdminStudents,
  issueAdminTestToken,
  purgeAdminTestStudents,
  type AdminStudentItem,
} from "@/lib/api";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import { ProgressBadge } from "@/components/admin/ProgressBadge";
import { useSessionStore } from "@/store/useSessionStore";
import { cn, genderLabel } from "@/lib/utils";

function StudentAvatar({
  student,
  revealed,
  photoUrl,
  loadFailed,
  onToggle,
  onImageError,
}: {
  student: AdminStudentItem;
  revealed: boolean;
  // 펼친 뒤 따로 받아온 presigned URL. 아직 로딩 중이면 null.
  photoUrl: string | null;
  // 세션 만료가 아닌 사유로 URL 조회에 실패했거나, 캐시된 URL 자체가
  // 만료되어 이미지 로드에 실패한 경우. 스켈레톤이 무한히 도는 것을 막고
  // 실패했음을 알린다(재시도는 다음 접기/펼치기 때만 — 자동 재시도 없음).
  loadFailed: boolean;
  onToggle: () => void;
  // 렌더링된 <img>가 실제 로드에 실패했을 때(주로 presigned URL 만료 → 403).
  // 캐시를 지워 다음에 펼칠 때 새 URL을 받아오게 하는 것은 호출부 책임이다.
  onImageError: () => void;
}) {
  if (!student.has_photo) {
    return (
      <span className="grid size-10 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground ring-1 ring-border">
        {student.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={
        revealed && loadFailed
          ? `${student.name} 사진을 불러오지 못했습니다`
          : revealed
            ? `${student.name} 사진 숨기기`
            : `${student.name} 사진 보기`
      }
      className="group relative block size-10 overflow-hidden rounded-full ring-1 ring-border"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {revealed && photoUrl ? (
        // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={student.name}
          className="size-full object-cover"
          // 캐시된 URL이 만료되면(1시간) S3가 403을 주고 <img>가 깨진다. 이 시점에만
          // 실패로 전환한다 — photoUrl이 사라지므로 같은 src로 onError가 반복
          // 호출되며 무한 루프를 도는 일은 없다(다음 렌더에서 실패 분기로 빠짐).
          onError={onImageError}
        />
      ) : revealed && loadFailed ? (
        // 조회 실패(세션 만료 제외) — 스켈레톤 대신 실패를 표시한다.
        <span className="grid size-full place-items-center bg-destructive/10 text-destructive">
          <AlertTriangle className="size-4" aria-hidden />
        </span>
      ) : revealed ? (
        // 펼쳤지만 URL이 아직 안 온 상태.
        <Skeleton className="size-full rounded-full" />
      ) : (
        <span className="grid size-full place-items-center bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <ImageIcon className="size-4" aria-hidden />
        </span>
      )}
    </button>
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

type SortKey = "name_asc" | "created_desc" | "created_asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "최신 가입순" },
  { value: "created_asc", label: "오래된 가입순" },
  { value: "name_asc", label: "가나다순" },
];

// Select 값은 빈 문자열을 허용하지 않으므로 "전체"용 센티널을 쓴다.
const ALL_SCHOOLS = "__all__";

export default function AdminStudentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AdminStudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [photoRevealed, setPhotoRevealed] = useState<Set<string>>(new Set());
  // 펼친 학생의 사진 URL 캐시. 목록이 사진을 안 받으므로 클릭 시점에 1건씩 받는다.
  const [photoUrls, setPhotoUrls] = useState<Map<string, string | null>>(new Map());
  // 세션 만료가 아닌 사유로 사진 URL 조회에 실패한 학생. 스켈레톤이 무한히
  // 도는 것을 막는 용도 — 401은 여기 담지 않고 로그인 화면으로 보낸다.
  const [photoLoadFailed, setPhotoLoadFailed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<AdminStudentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [schoolFilter, setSchoolFilter] = useState<string>(ALL_SCHOOLS);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  // 실제 가입 회원 수(테스트 계정 제외) — "총 N명" 표시용. total(=list 페이지네이션
  // 기준값)은 include_test:true라 테스트 계정이 섞여 있어 회원 수로 쓸 수 없다.
  const [memberTotal, setMemberTotal] = useState(0);

  // 테스트 계정 발급 — 로그인 화면으로 들어올 수 없는 kind='test' 계정을 여기서만 만든다.
  const [testName, setTestName] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  // 테스트 계정 일괄 삭제 — DB cascade + S3 사진·카드 이미지까지 지워 되돌릴 수 없다.
  const [purgeConfirming, setPurgeConfirming] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  // "이 계정으로 테스트 시작" 실패 — 목록 로딩 실패(error)와 원인이 달라 배너를 분리한다.
  const [testStartError, setTestStartError] = useState<string | null>(null);

  // 목록 로드 — 검색·필터·정렬·페이지네이션을 모두 서버에 위임한다.
  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setLoading(true);
    try {
      const filters = {
        q: submittedQuery || undefined,
        school: schoolFilter === ALL_SCHOOLS ? undefined : schoolFilter,
        sort: sortKey,
      };
      const [res, memberRes] = await Promise.all([
        fetchAdminStudents(token, {
          ...filters,
          limit: pageSize,
          offset: page * pageSize,
          // 아바타는 클릭해야 보이므로 목록에서는 사진을 받지 않는다(서명 50건 절약).
          include_photo: false,
          // 관리자는 테스트 계정도 관리(발급 확인·진입·삭제)해야 하므로 목록에 포함시킨다.
          include_test: true,
        }),
        // "총 N명" 배지용 — 테스트 계정을 뺀 실제 회원 수만 필요하므로 include_test를
        // 생략(백엔드 기본값 false)하고 items는 버릴 것이라 limit을 최소로 준다.
        fetchAdminStudents(token, { ...filters, limit: 1, offset: 0, include_photo: false }),
      ]);
      setTotal(res.total);
      setMemberTotal(memberRes.total);
      // 삭제 등으로 현재 페이지가 범위를 벗어나면 첫 페이지로 되돌린다.
      if (page > 0 && res.items.length === 0 && res.total > 0) {
        setPage(0);
        return;
      }
      setItems(res.items);
      setCheckedIds(new Set()); // 페이지가 바뀌면 선택 초기화
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
  }, [router, submittedQuery, schoolFilter, sortKey, pageSize, page]);

  useEffect(() => {
    // 검색어·필터·정렬·페이지 크기·페이지가 바뀔 때마다 다시 로드한다.
    load();
  }, [load]);

  // 학교 필터 드롭다운 목록 — 마운트 시 1회, 삭제 후 갱신.
  const loadSchools = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      setSchools(await fetchAdminSchools(token));
    } catch {
      // 필터 목록 로드 실패는 치명적이지 않으므로 조용히 무시한다.
    }
  }, []);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // 현재 필터 조건에서 테스트 계정이 몇 개인지(= 전체 - 실제 회원). 음수 방지용 max.
  const testTotal = Math.max(0, total - memberTotal);

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePhoto(id: string) {
    setPhotoRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // 처음 펼치는 학생만 URL을 받아온다. 이미 받았으면 캐시를 쓴다.
    if (photoRevealed.has(id) || photoUrls.has(id)) return;
    const token = getAdminToken();
    if (!token) return;
    fetchAdminStudentPhotoUrl(token, id)
      .then((url) => setPhotoUrls((prev) => new Map(prev).set(id, url)))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          // 세션 만료 — 캐시하지 않는다. 재로그인 후 다시 펼치면 재시도된다.
          clearAdminToken();
          router.replace("/admin/login");
          return;
        }
        // 그 외 실패(404·네트워크 오류 등)는 기존처럼 null로 캐시하되,
        // 스켈레톤이 무한히 돌지 않도록 실패 표시를 함께 남긴다.
        setPhotoUrls((prev) => new Map(prev).set(id, null));
        setPhotoLoadFailed((prev) => new Set(prev).add(id));
      });
  }

  // 렌더된 <img>가 실제로 로드에 실패했을 때(주로 presigned URL 만료 → S3 403).
  // 캐시된 URL을 지워 다음 접기/펼치기에서 새 URL을 받아오게 하고, 그때까지는
  // 조회 실패와 같은 실패 표시를 보여준다. photoUrl이 사라지면 <img> 자체가
  // 더 이상 렌더되지 않으므로 onError가 재귀적으로 반복 호출되지 않는다.
  function handlePhotoLoadError(id: string) {
    setPhotoUrls((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setPhotoLoadFailed((prev) => new Set(prev).add(id));
  }

  function toggleCheck(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allChecked =
    items.length > 0 && items.every((s) => checkedIds.has(s.id));
  const someChecked = items.some((s) => checkedIds.has(s.id)) && !allChecked;

  function toggleCheckAll() {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (items.every((s) => next.has(s.id))) {
        items.forEach((s) => next.delete(s.id));
      } else {
        items.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    try {
      await bulkDeleteAdminStudents(token, [...checkedIds]);
      setBulkConfirming(false);
      setCheckedIds(new Set());
      await load();
      await loadSchools();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setBulkError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    } finally {
      setBulkDeleting(false);
    }
  }

  // 테스트 계정 발급 — 비밀번호는 서버가 랜덤으로 채우므로 이름만 받는다.
  // 성별은 카드 생성·표시 어디에도 쓰이지 않아(백엔드 확인) 값을 고정한다.
  async function handleCreateTestStudent() {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    const trimmed = testName.trim();
    if (!trimmed) return;
    setIssuing(true);
    setIssueError(null);
    try {
      await createAdminTestStudent(token, { name: trimmed, gender: "male" });
      setTestName("");
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setIssueError(err instanceof ApiError ? err.message : "발급하지 못했습니다.");
    } finally {
      setIssuing(false);
    }
  }

  async function handlePurgeTestStudents() {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setPurging(true);
    setPurgeError(null);
    try {
      const res = await purgeAdminTestStudents(token);
      setPurgeConfirming(false);
      setPurgeResult(`테스트 계정 ${res.deleted}개를 삭제했습니다.`);
      await load();
      await loadSchools();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setPurgeError(err instanceof ApiError ? err.message : "삭제하지 못했습니다.");
    } finally {
      setPurging(false);
    }
  }

  // 테스트 계정은 학생 로그인 화면으로 들어올 수 없으므로 여기서 토큰을 발급받아
  // 관리자 화면과 학생 화면이 공유하는 세션 store에 바로 채워 넣고 이동한다.
  async function handleStartAsTestStudent(studentId: string) {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setTestStartError(null);
    try {
      const { student_token } = await issueAdminTestToken(token, studentId);
      useSessionStore.getState().setAuth(student_token, studentId);
      router.push(`/profile/${studentId}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setTestStartError(
        err instanceof ApiError ? err.message : "테스트 시작에 실패했습니다."
      );
    }
  }

  return (
    <div
      className={cn(
        "min-h-screen bg-muted/40 transition-[padding-right] duration-200 ease-in-out",
        // 사이드바(36rem)가 내용을 가리지 않도록 오른쪽 여백을 확보해 밀어낸다.
        // xl(1280px) 미만은 1280-576=704px밖에 안 남아 표가 더 좁아지므로,
        // 그 구간은 기존처럼 사이드바가 내용 위에 겹쳐 보이게 둔다.
        selected && "xl:pr-[36rem]"
      )}
    >
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
              회원가입한 학생의 정보와 사진을 확인하고, 관리자가 발급한 테스트
              계정을 관리합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 실제 가입 회원만 센다 — 테스트 계정은 관리자 픽스처라 회원 수에서 뺀다. */}
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-sm">
              <span className="tabular-nums">{memberTotal}</span>
              <span className="text-muted-foreground">명</span>
            </span>
            {testTotal > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-muted/40 px-3 py-1 text-sm font-medium text-muted-foreground">
                <span className="tabular-nums">{testTotal}</span>
                테스트 계정
              </span>
            )}
          </div>
        </div>

        {/* 테스트 계정 관리 — 학생 로그인 화면으로 들어올 수 없는 kind='test' 계정을
            여기서만 발급·정리한다. */}
        <div className="mb-4 rounded-lg border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateTestStudent();
              }}
            >
              <Input
                aria-label="테스트 계정 이름"
                placeholder="테스트 계정 이름"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                disabled={issuing}
                className="h-9 w-48"
              />
              <Button
                type="submit"
                size="sm"
                disabled={issuing || !testName.trim()}
              >
                {issuing ? "발급 중…" : "테스트 계정 발급"}
              </Button>
              {issueError && (
                <span className="text-sm text-destructive">{issueError}</span>
              )}
            </form>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                setPurgeError(null);
                setPurgeResult(null);
                setPurgeConfirming(true);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              테스트 계정 일괄 삭제
            </Button>
          </div>
          {purgeResult && (
            <p className="mt-2 text-sm text-muted-foreground">{purgeResult}</p>
          )}
          {testStartError && (
            <p className="mt-2 text-sm text-destructive">{testStartError}</p>
          )}
        </div>

        {/* 검색 */}
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setSubmittedQuery(query.trim());
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

        {/* 정렬 · 페이지 크기 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {total > 0 ? (
              <>
                <span className="tabular-nums">
                  {page * pageSize + 1}–
                  {Math.min((page + 1) * pageSize, total)}
                </span>{" "}
                {/* 이 표는 테스트 계정도 함께 보여주므로 "명"이 아니라 "건"으로 —
                    회원 수 표기는 위 배지(memberTotal)가 담당한다. */}
                / 총 <span className="tabular-nums">{total}</span>건
                {testTotal > 0 && `(테스트 계정 ${testTotal}개 포함)`}
              </>
            ) : (
              "표시할 회원이 없습니다"
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={schoolFilter}
              onValueChange={(v) => {
                setSchoolFilter(v ?? ALL_SCHOOLS);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[160px]" aria-label="학교 필터">
                <SelectValue>
                  {(v: string | null) =>
                    !v || v === ALL_SCHOOLS ? "전체 학교" : v
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SCHOOLS}>전체 학교</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school} value={school}>
                    {school}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sortKey}
              onValueChange={(v) => {
                setSortKey(v as SortKey);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[140px]" aria-label="정렬 기준">
                <SelectValue>
                  {(v: string | null) =>
                    SORT_OPTIONS.find((o) => o.value === v)?.label ??
                    SORT_OPTIONS[0].label
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(0);
              }}
            >
              <SelectTrigger className="w-[120px]" aria-label="페이지 크기">
                <SelectValue>
                  {(v: string | null) => `${v ?? pageSize}개씩 보기`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">50개씩 보기</SelectItem>
                <SelectItem value="100">100개씩 보기</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* 선택 삭제 툴바 */}
        {checkedIds.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
            <span className="text-sm font-medium">
              <span className="tabular-nums">{checkedIds.size}</span>명 선택됨
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCheckedIds(new Set())}
              >
                선택 해제
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setBulkError(null);
                  setBulkConfirming(true);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                선택 삭제
              </Button>
            </div>
          </div>
        )}

        {/* 회원 테이블 */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-b bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10 pl-5">
                  <Checkbox
                    aria-label="전체 선택"
                    checked={allChecked}
                    indeterminate={someChecked}
                    onCheckedChange={toggleCheckAll}
                    disabled={items.length === 0}
                  />
                </TableHead>
                <TableHead className="w-14">사진</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>학교</TableHead>
                <TableHead>학년·반·번호</TableHead>
                <TableHead>성별</TableHead>
                <TableHead>진행도</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>비밀번호</TableHead>
                <TableHead>동의</TableHead>
                <TableHead className="pr-5">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell className="pl-5">
                      <Skeleton className="size-4 rounded" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="size-10 rounded-full" />
                    </TableCell>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={11} className="py-16">
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
                    data-state={checkedIds.has(s.id) ? "selected" : undefined}
                    className="cursor-pointer transition-colors hover:bg-muted/40 data-[state=selected]:bg-primary/5"
                    onClick={() => setSelected(s)}
                  >
                    <TableCell
                      className="pl-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={`${s.name} 선택`}
                        checked={checkedIds.has(s.id)}
                        onCheckedChange={() => toggleCheck(s.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <StudentAvatar
                        student={s}
                        revealed={photoRevealed.has(s.id)}
                        photoUrl={photoUrls.get(s.id) ?? null}
                        loadFailed={photoLoadFailed.has(s.id)}
                        onToggle={() => togglePhoto(s.id)}
                        onImageError={() => handlePhotoLoadError(s.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.kind === "test"
                        ? "테스트"
                        : s.kind === "guest"
                          ? "개인"
                          : s.school}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {/* 학교 소속이 아니면(개인 참여자·테스트 계정) 전부 0이라
                          의미가 없다 — StudentDetailSidebar와 같은 조건(school 유무). */}
                      {s.school
                        ? `${s.grade}학년 ${s.class_no}반 ${s.student_no}번`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {genderLabel(s.gender)}
                    </TableCell>
                    <TableCell>
                      <ProgressBadge progress={s.progress} />
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
                    <TableCell>
                      <ConsentTag agreed={s.consent_privacy} />
                    </TableCell>
                    <TableCell
                      className="pr-5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {s.kind === "test" && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleStartAsTestStudent(s.id)}
                        >
                          이 계정으로 테스트 시작
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* 페이지네이션 */}
        {!loading && pageCount > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" aria-hidden />
              이전
            </Button>
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              {page + 1} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              다음
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </main>

      <StudentDetailSidebar
        student={selected}
        onClose={() => setSelected(null)}
        onDeleted={() => {
          setSelected(null);
          load();
          loadSchools();
        }}
      />

      {/* 선택 삭제 확인 */}
      <Dialog
        open={bulkConfirming}
        onOpenChange={(o) => !bulkDeleting && setBulkConfirming(o)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden />
              선택한 회원 삭제
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {checkedIds.size}명
            </span>
            의 회원을 삭제합니다. 설문 답변·페르소나·카드와 사진까지 모두 영구
            삭제되며 되돌릴 수 없습니다.
          </p>
          {bulkError && (
            <p className="text-sm text-destructive">{bulkError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={bulkDeleting}
              onClick={() => setBulkConfirming(false)}
              className="gap-1.5"
            >
              <X className="size-4" aria-hidden />
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={bulkDeleting}
              onClick={handleBulkDelete}
              className="gap-1.5"
            >
              <Trash2 className="size-4" aria-hidden />
              {bulkDeleting ? "삭제 중…" : `${checkedIds.size}명 영구 삭제`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 테스트 계정 일괄 삭제 확인 */}
      <Dialog
        open={purgeConfirming}
        onOpenChange={(o) => !purging && setPurgeConfirming(o)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden />
              테스트 계정 일괄 삭제
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            모든 테스트 계정을 삭제합니다. 설문 답변·페르소나·카드와 사진까지
            모두 영구 삭제되며 되돌릴 수 없습니다.
          </p>
          {purgeError && (
            <p className="text-sm text-destructive">{purgeError}</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={purging}
              onClick={() => setPurgeConfirming(false)}
              className="gap-1.5"
            >
              <X className="size-4" aria-hidden />
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={purging}
              onClick={handlePurgeTestStudents}
              className="gap-1.5"
            >
              <Trash2 className="size-4" aria-hidden />
              {purging ? "삭제 중…" : "전체 영구 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
