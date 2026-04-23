"use client";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập ÔnGấp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dùng Google để đăng nhập. Chúng tôi chỉ lấy email + tên hiển thị.
          </p>
          <button
            type="button"
            onClick={signInWithGoogle}
            className={cn(buttonVariants(), "w-full")}
          >
            Đăng nhập với Google
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
