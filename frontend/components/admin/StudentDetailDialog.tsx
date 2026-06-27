"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdminStudentItem } from "@/lib/api";

export function StudentDetailDialog({
  student,
  onClose,
}: {
  student: AdminStudentItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={student !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {student && (
          <>
            <DialogHeader>
              <DialogTitle>{student.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              {student.photo_url ? (
                // 외부 presigned URL — next/image 도메인 설정 회피 위해 img 사용.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={student.photo_url}
                  alt={`${student.name} 사진`}
                  className="mx-auto h-48 w-48 rounded-lg object-cover"
                />
              ) : (
                <div className="mx-auto flex h-48 w-48 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  사진 없음
                </div>
              )}
              <dl className="grid grid-cols-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">학교</dt>
                <dd className="col-span-2">{student.school}</dd>
                <dt className="text-muted-foreground">학년/반/번호</dt>
                <dd className="col-span-2">
                  {student.grade}학년 {student.class_no}반 {student.student_no}번
                </dd>
                <dt className="text-muted-foreground">비밀번호</dt>
                <dd className="col-span-2 font-mono">{student.password}</dd>
                <dt className="text-muted-foreground">개인정보 동의</dt>
                <dd className="col-span-2">
                  {student.consent_privacy ? "동의" : "미동의"}
                </dd>
                <dt className="text-muted-foreground">가입일</dt>
                <dd className="col-span-2">
                  {new Date(student.created_at).toLocaleString("ko-KR")}
                </dd>
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
