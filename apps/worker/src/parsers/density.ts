export interface DensityInput {
  pageCount: number;
  totalChars: number;
}

export function needsOcr({ pageCount, totalChars }: DensityInput): boolean {
  if (pageCount <= 0) return false;
  const perPage = totalChars / pageCount;
  return perPage < 100;
}
