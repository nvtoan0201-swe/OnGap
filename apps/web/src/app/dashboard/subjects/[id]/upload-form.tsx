"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadDocument } from "./upload-actions";

export function UploadForm({ subjectId }: { subjectId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await uploadDocument(subjectId, fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="type">Loại tài liệu</Label>
        <select
          id="type"
          name="type"
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          defaultValue="slide"
        >
          <option value="slide">Slide bài giảng</option>
          <option value="outline">Đề cương</option>
          <option value="past_exam">Đề thi năm trước</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="file">File (.pdf / .docx / .pptx, ≤ 50 MB)</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept=".pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Đang tải lên..." : "Tải lên"}
      </Button>
    </form>
  );
}
