import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { createSubject } from "@/app/dashboard/actions";

export default function NewSubjectPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Tạo môn học mới</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createSubject} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Tên môn *</Label>
                <Input id="name" name="name" required placeholder="Kinh tế vi mô" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Mã môn (optional)</Label>
                <Input id="code" name="code" placeholder="ECON101" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam_date">Ngày thi (optional)</Label>
                <Input id="exam_date" name="exam_date" type="date" />
              </div>
              <div className="flex gap-2">
                <button type="submit" className={cn(buttonVariants())}>
                  Tạo
                </button>
                <Link href="/dashboard" className={cn(buttonVariants({ variant: "ghost" }))}>
                  Hủy
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
