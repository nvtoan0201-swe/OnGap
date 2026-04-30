import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";
import { ChatWindow } from "./chat-window";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SubjectChatPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subject, error } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("id", id)
    .single();
  if (error || !subject) redirect("/dashboard");

  const { count: doneCount } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", id)
    .eq("status", "done");

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div>
          <Link
            href={`/dashboard/subjects/${id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {subject.name}
          </Link>
          <h1 className="text-2xl font-bold mt-2">Hỏi đáp</h1>
          <p className="text-sm text-muted-foreground">
            {doneCount && doneCount > 0
              ? `${doneCount} tài liệu đã được trích xuất.`
              : "Chưa có tài liệu nào sẵn sàng — hãy đợi trích xuất xong."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trợ lý ôn thi</CardTitle>
          </CardHeader>
          <CardContent>
            <ChatWindow subjectId={subject.id} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
