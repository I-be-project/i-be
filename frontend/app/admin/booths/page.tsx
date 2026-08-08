"use client";

import { Inbox, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { BoothFormDialog } from "@/components/admin/BoothFormDialog";
import { BoothQrDialog } from "@/components/admin/BoothQrDialog";
import { Toast, type ToastVariant } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clearAdminToken, getAdminToken } from "@/lib/adminAuth";
import {
  ApiError,
  createAdminBooth,
  deleteAdminBooth,
  fetchAdminBooths,
  updateAdminBooth,
  type AdminBooth,
} from "@/lib/api";

export default function AdminBoothsPage() {
  const router = useRouter();
  const [booths, setBooths] = useState<AdminBooth[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBooth | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrBooth, setQrBooth] = useState<AdminBooth | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const load = useCallback(async () => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setLoading(true);
    try {
      setBooths(await fetchAdminBooths(token));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setToast({
        message:
          err instanceof ApiError ? err.message : "부스를 불러오지 못했어요.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(booth: AdminBooth) {
    setEditing(booth);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSubmit(values: {
    name: string;
    description: string | null;
  }) {
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editing) {
        await updateAdminBooth(token, editing.id, values);
      } else {
        await createAdminBooth(token, values);
      }
      setFormOpen(false);
      setToast({
        message: editing ? "부스를 수정했어요." : "부스를 추가했어요.",
        variant: "info",
      });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setFormError(
        err instanceof ApiError ? err.message : "저장하지 못했어요."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(booth: AdminBooth) {
    // 인쇄된 QR이 무효가 되므로 한 번 되묻는다.
    const ok = window.confirm(
      `'${booth.name}' 부스를 삭제할까요?\n이미 인쇄한 QR(${booth.code})은 더 이상 동작하지 않아요.`
    );
    if (!ok) return;

    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    try {
      await deleteAdminBooth(token, booth.id);
      setToast({ message: "부스를 삭제했어요.", variant: "info" });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAdminToken();
        router.replace("/admin/login");
        return;
      }
      setToast({
        message: err instanceof ApiError ? err.message : "삭제하지 못했어요.",
        variant: "error",
      });
    }
  }

  return (
    <div className="min-h-dvh bg-background">
      <ConsoleHeader />

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">부스 관리</h1>
            <p className="text-sm text-muted-foreground">
              부스를 등록하면 QR 링크가 자동으로 발급돼요.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            부스 추가
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : booths.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-muted-foreground">
            <Inbox className="size-8" aria-hidden />
            <p className="text-sm">아직 등록한 부스가 없어요.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead>코드</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {booths.map((booth) => (
                  <TableRow key={booth.id}>
                    <TableCell className="font-medium">{booth.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {booth.description ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono">{booth.code}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setQrBooth(booth)}
                        >
                          <QrCode className="size-4" aria-hidden />
                          QR
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => openEdit(booth)}
                        >
                          <Pencil className="size-4" aria-hidden />
                          수정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive"
                          onClick={() => void handleDelete(booth)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>

      <BoothFormDialog
        open={formOpen}
        booth={editing}
        submitting={submitting}
        error={formError}
        onOpenChange={setFormOpen}
        onSubmit={(values) => void handleSubmit(values)}
      />

      <BoothQrDialog
        booth={qrBooth}
        onOpenChange={(open) => !open && setQrBooth(null)}
      />

      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
