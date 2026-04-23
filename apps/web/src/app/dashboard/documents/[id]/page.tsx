import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DocumentPreviewPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, subject_id, type, file_url, parsed_markdown, page_count, status, error")
    .eq("id", id)
    .single();
  if (error || !doc) redirect("/dashboard");

  const filename = doc.file_url.split("/").pop();

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-6">
        <Link
          href={`/dashboard/subjects/${doc.subject_id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Môn học
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{filename}</h1>
          <p className="text-sm text-muted-foreground">
            {doc.type} · {doc.page_count ?? "?"} trang · trạng thái: {doc.status}
          </p>
        </div>

        {doc.status === "failed" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Lỗi</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm whitespace-pre-wrap">{doc.error}</pre>
            </CardContent>
          </Card>
        )}

        {doc.parsed_markdown ? (
          <Card>
            <CardHeader>
              <CardTitle>Xem trước nội dung (Markdown thô)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded max-h-[70vh] overflow-auto">
                {doc.parsed_markdown}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6 text-muted-foreground text-sm">
              Đang xử lý hoặc chưa có nội dung. Quay lại sau 1-2 phút.
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
