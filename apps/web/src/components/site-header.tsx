import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="font-bold text-lg">
          ÔnGấp
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Đăng nhập
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            Thử miễn phí
          </Link>
        </nav>
      </div>
    </header>
  );
}
