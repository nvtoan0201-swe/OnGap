import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="container mx-auto px-4 py-20 text-center">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Ôn thi cuối kỳ trong 3 ngày
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload slide bài giảng. AI <strong>trích xuất toàn bộ kiến thức</strong>
            &nbsp;(không tóm tắt mất nội dung) thành flashcard, quiz, và dự đoán đề.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
              Bắt đầu miễn phí
            </Link>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16 grid gap-6 md:grid-cols-3">
          {[
            {
              title: "Trích xuất, không tóm tắt",
              body: "Multi-pass Claude AI giữ lại 100% định nghĩa, công thức, ví dụ — cite đúng trang nguồn.",
            },
            {
              title: "Flashcard verbatim",
              body: "Spaced repetition kiểu Tinder. Mặt sau là nguyên văn từ slide, không paraphrase sai.",
            },
            {
              title: "Dự đoán đề",
              body: "Match đề cương + đề thi cũ crowdsource để dự đoán câu hỏi có khả năng cao.",
            },
          ].map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © 2026 ÔnGấp
      </footer>
    </div>
  );
}
