"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminBooth } from "@/lib/api";

interface BoothFormDialogProps {
  open: boolean;
  /** null이면 생성, 값이 있으면 그 부스 수정. */
  booth: AdminBooth | null;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string; description: string | null }) => void;
}

/**
 * 부스 생성·수정 폼. 코드는 발급 후 불변이라 입력란을 두지 않고 읽기 전용으로만 보여준다.
 *
 * 열릴 때마다 대상 부스 값으로 폼을 초기화해야 한다. effect로 setState 하는 대신,
 * 다이얼로그가 열려 있을 때만 내부 폼(BoothFormBody)을 마운트하고 booth로 key를 줘서
 * "마운트 시 초기값을 다시 계산"하는 React 권장 패턴(상태를 key로 리셋)을 따른다.
 * (react-hooks/set-state-in-effect 회피)
 */
export function BoothFormDialog({
  open,
  booth,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: BoothFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        {open && (
          <BoothFormBody
            key={booth?.id ?? "create"}
            booth={booth}
            submitting={submitting}
            error={error}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BoothFormBodyProps {
  booth: AdminBooth | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (values: { name: string; description: string | null }) => void;
}

/** 다이얼로그가 열려 있는 동안만 사는 실제 폼. 마운트 시점의 booth 값으로 초기화된다. */
function BoothFormBody({
  booth,
  submitting,
  error,
  onCancel,
  onSubmit,
}: BoothFormBodyProps) {
  const [name, setName] = useState(booth?.name ?? "");
  const [description, setDescription] = useState(booth?.description ?? "");

  const trimmedName = name.trim();

  function handleSubmit() {
    if (!trimmedName || submitting) return;
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{booth ? "부스 수정" : "부스 추가"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {booth && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">코드</p>
            <p className="font-mono text-sm text-muted-foreground">
              {booth.code}
            </p>
            <p className="text-xs text-muted-foreground">
              코드는 인쇄물에 박혀 있어 변경할 수 없어요.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="booth-name" className="text-sm font-medium">
            이름
          </label>
          <Input
            id="booth-name"
            value={name}
            maxLength={100}
            placeholder="예: 드론 체험"
            disabled={submitting}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="booth-description" className="text-sm font-medium">
            설명 <span className="text-muted-foreground">(선택)</span>
          </label>
          <Textarea
            id="booth-description"
            value={description}
            maxLength={500}
            rows={3}
            placeholder="부스에서 무엇을 하는지 한 줄로"
            disabled={submitting}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={onCancel}
        >
          취소
        </Button>
        <Button
          type="button"
          disabled={submitting || !trimmedName}
          onClick={handleSubmit}
        >
          {booth ? "저장" : "추가"}
        </Button>
      </DialogFooter>
    </>
  );
}
