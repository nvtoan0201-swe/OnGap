import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subjects, error } = await supabase
    .from("subjects")
    .select("id, name, code, exam_date")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Các môn của bạn</h1>
          <Link href="/dashboard/subjects/new" className={cn(buttonVariants())}>
            + Thêm môn
          </Link>
        </div>

        {subjects && subjects.length === 0 ? (
          <Card className="mt-6">
            <CardContent className="p-8 text-center text-muted-foreground">
              Chưa có môn nào. Bấm &quot;+ Thêm môn&quot; để tạo môn đầu tiên.
            </CardContent>
          </Card>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subjects?.map((s) => (
              <Link key={s.id} href={`/dashboard/subjects/${s.id}`}>
                <Card className="hover:border-foreground/30 transition">
                  <CardHeader>
                    <CardTitle>{s.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {s.code && <div>Mã: {s.code}</div>}
                    {s.exam_date && <div>Ngày thi: {s.exam_date}</div>}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
