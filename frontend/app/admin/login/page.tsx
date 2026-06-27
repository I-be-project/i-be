"use client";

import { LogIn, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, adminLogin } from "@/lib/api";
import { setAdminToken } from "@/lib/adminAuth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { admin_token } = await adminLogin(username, password);
      setAdminToken(admin_token);
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl bg-[var(--chart-2)] text-primary-foreground shadow-sm">
            <Users className="size-5" aria-hidden />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            나Be한마당
          </p>
          <h1 className="mt-1 text-xl font-bold tracking-tight">관리자 로그인</h1>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-xl border bg-card p-6 shadow-sm"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-username"
                className="text-sm font-medium"
              >
                아이디
              </label>
              <Input
                id="admin-username"
                placeholder="관리자 아이디"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="text-sm font-medium"
              >
                비밀번호
              </label>
              <Input
                id="admin-password"
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full gap-1.5"
              disabled={loading || !username || !password}
            >
              {loading ? (
                "로그인 중…"
              ) : (
                <>
                  <LogIn className="size-4" aria-hidden />
                  로그인
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
