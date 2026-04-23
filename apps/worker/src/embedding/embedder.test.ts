import { describe, it, expect, beforeAll } from "vitest";
import { embedText, embedPassages, cosine, initEmbedder } from "./embedder.js";

describe("embedder", () => {
  beforeAll(async () => {
    await initEmbedder();
  }, 180_000);

  it("embeds Vietnamese text into a 768-dim vector", async () => {
    const vec = await embedText(
      "Cầu thị trường là lượng hàng hóa người mua sẵn sàng mua.",
    );
    expect(vec).toHaveLength(768);
    expect(Number.isFinite(vec[0])).toBe(true);
    // e5 models are L2-normalized; magnitude ≈ 1
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeGreaterThan(0.95);
    expect(mag).toBeLessThan(1.05);
  }, 120_000);

  it("gives higher cosine between semantically close VN sentences", async () => {
    const [a, b, c] = await embedPassages([
      "Cầu thị trường phụ thuộc vào giá hàng hóa.",
      "Giá cả ảnh hưởng đến nhu cầu của người tiêu dùng.",
      "Con mèo của tôi thích ăn cá.",
    ]);
    expect(cosine(a!, b!)).toBeGreaterThan(cosine(a!, c!));
  }, 120_000);
});
