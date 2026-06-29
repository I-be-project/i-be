"use client";

import { ImageOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminStudentItem } from "@/lib/api";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

export function StudentDetailDialog({
  student,
  onClose,
}: {
  student: AdminStudentItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        {student && (
          <>
            {/* 사진 헤더 */}
            <div className="relative flex h-56 items-center justify-center bg-muted">
              {student.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.photo_url}
                  alt={`${student.name} 사진`}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageOff className="size-7" aria-hidden />
                  <span className="text-sm">사진 없음</span>
                </div>
              )}
            </div>

            <div className="p-6">
              <DialogHeader className="mb-1 space-y-1 text-left">
                <DialogTitle className="text-xl">{student.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">{student.school}</p>
              </DialogHeader>

              <dl className="mt-3 divide-y divide-border">
                <Field label="학년·반·번호">
                  <span className="tabular-nums">
                    {student.grade}학년 {student.class_no}반 {student.student_no}번
                  </span>
                </Field>
                <Field label="비밀번호">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono">
                    {student.password}
                  </span>
                </Field>
                <Field label="개인정보 동의">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={
                        student.consent_privacy
                          ? "size-1.5 rounded-full bg-emerald-500"
                          : "size-1.5 rounded-full bg-muted-foreground/40"
                      }
                      aria-hidden
                    />
                    {student.consent_privacy ? "동의" : "미동의"}
                  </span>
                </Field>
                <Field label="가입일">
                  <span className="tabular-nums">
                    {new Date(student.created_at).toLocaleString("ko-KR")}
                  </span>
                </Field>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
