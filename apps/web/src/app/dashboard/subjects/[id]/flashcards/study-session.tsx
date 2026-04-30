"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { submitReview } from "./review-actions";

export interface StudyCard {
  id: string;
  front: string;
  back_verbatim: string;
  page_ref: number | null;
  difficulty: number;
}

interface Props {
  subjectId: string;
  cards: StudyCard[];
}

const RATINGS: { label: string; value: 1 | 3 | 5; variant: "destructive" | "secondary" | "default" }[] = [
  { label: "Khó", value: 1, variant: "destructive" },
  { label: "Bình thường", value: 3, variant: "secondary" },
  { label: "Thuộc", value: 5, variant: "default" },
];

export function StudySession({ subjectId, cards }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground text-sm">
          Chưa có flashcard. Tải tài liệu lên và đợi xử lý xong (~1-2 phút).
        </CardContent>
      </Card>
    );
  }

  if (index >= cards.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <div className="text-lg font-semibold">Hoàn thành {cards.length} thẻ</div>
          <Link
            href={`/dashboard/subjects/${subjectId}`}
            className="text-sm underline"
          >
            ← Quay lại môn học
          </Link>
        </CardContent>
      </Card>
    );
  }

  const card = cards[index];
  if (!card) return null;
  const flashcardId = card.id;

  function rate(rating: 1 | 3 | 5) {
    setError(null);
    setIndex((i) => i + 1);
    setFlipped(false);
    startTransition(async () => {
      try {
        await submitReview(subjectId, flashcardId, rating);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Thẻ {index + 1} / {cards.length}
      </div>

      <Card
        className="min-h-[55vh] cursor-pointer select-none"
        onClick={() => !flipped && setFlipped(true)}
      >
        <CardContent className="p-6 flex flex-col gap-4 h-full">
          <div className="text-xl font-medium leading-relaxed">{card.front}</div>

          {flipped && (
            <>
              <div className="border-t pt-4 text-sm whitespace-pre-wrap leading-relaxed">
                {card.back_verbatim}
              </div>
              {card.page_ref != null && (
                <div className="text-xs text-muted-foreground">
                  Nguồn: trang {card.page_ref}
                </div>
              )}
            </>
          )}

          {!flipped && (
            <div className="mt-auto text-xs text-muted-foreground text-center">
              Bấm để xem mặt sau
            </div>
          )}
        </CardContent>
      </Card>

      {flipped && (
        <div className="grid grid-cols-3 gap-2">
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              variant={r.variant}
              disabled={isPending}
              onClick={() => rate(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
