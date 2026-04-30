// Minimal SM-2-flavoured schedule. Pure: same input → same output.
// Tuneable later — currently maps user-perceived difficulty to a fixed
// delay. No EF/interval state stored on the flashcard yet.
export type Rating = 0 | 1 | 2 | 3 | 4 | 5;

const MS = {
  min: 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

export function nextReviewAt(rating: Rating, now: Date = new Date()): Date {
  const t = now.getTime();
  switch (rating) {
    case 0:
    case 1:
      return new Date(t + 5 * MS.min);
    case 2:
      return new Date(t + 10 * MS.min);
    case 3:
      return new Date(t + 1 * MS.day);
    case 4:
      return new Date(t + 3 * MS.day);
    case 5:
      return new Date(t + 7 * MS.day);
  }
}
