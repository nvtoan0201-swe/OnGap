import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "./upload-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  parsing: "Đang bóc tách",
  parsed: "Đã bóc tách",
  chunking: "Đang chia chunk",
  extracting: "Đang trích xuất",
  auditing: "Đang kiểm tra",
  done: "Hoàn tất",
  failed: "Lỗi",
};

export default async function SubjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subject, error: sErr } = await supabase
    .from("subjects")
    .select("id, name, code, exam_date")
    .eq("id", id)
    .single();
  if (sErr || !subject) redirect("/dashboard");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, type, file_url, status, page_count, created_at")
    .eq("subject_id", id)
    .order("created_at", { ascending: false });

  const { count: flashcardCount } = await supabase
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", id);

  const { data: latestAudit } = await supabase
    .from("coverage_audits")
    .select("coverage_pct, audited_at")
    .eq("subject_id", id)
    .order("audited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-8">
        <div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
            ← Danh sách môn
          </Link>
          <h1 className="text-2xl font-bold mt-2">{subject.name}</h1>
          {subject.code && <p className="text-muted-foreground text-sm">Mã: {subject.code}</p>}
          {subject.exam_date && (
            <p className="text-muted-foreground text-sm">Ngày thi: {subject.exam_date}</p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Học bài</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-medium">{flashcardCount ?? 0} flashcard</div>
              {latestAudit?.coverage_pct != null && (
                <div className="text-xs text-muted-foreground mt-1">
                  Đã phân tích {Number(latestAudit.coverage_pct).toFixed(0)}% nội dung
                </div>
              )}
            </div>
            {(flashcardCount ?? 0) > 0 ? (
              <Link
                href={`/dashboard/subjects/${id}/flashcards`}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                Bắt đầu học
              </Link>
            ) : (
              <span className="text-xs text-muted-foreground">
                Đang chờ tài liệu
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tải lên tài liệu</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm subjectId={subject.id} />
          </CardContent>
        </Card>

        <section>
          <h2 className="text-lg font-semibold mb-3">Tài liệu đã tải</h2>
          {!documents || documents.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                Chưa có tài liệu. Tải file đầu tiên ở trên.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => {
                const filename = d.file_url.split("/").pop();
                return (
                  <Card key={d.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{filename}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.type} · {d.page_count ?? "?"} trang
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs rounded-full border px-2 py-0.5">
                          {STATUS_LABELS[d.status] ?? d.status}
                        </span>
                        {d.status === "parsed" && (
                          <Link
                            href={`/dashboard/documents/${d.id}`}
                            className="text-sm underline"
                          >
                            Xem
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
