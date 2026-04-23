# ÔnGấp — Design Spec

**Ngày:** 2026-04-23
**Tác giả:** Toan (nvtoan0201@gmail.com)
**Trạng thái:** Draft — chờ review để chuyển sang implementation plan

---

## 1. Tóm tắt sản phẩm

**ÔnGấp** là ứng dụng web (PWA, mobile-first) giúp sinh viên Việt Nam ôn thi cuối kỳ nhanh trong 3-7 ngày cuối. Sinh viên upload slide bài giảng, đề cương ôn tập, và (optional) đề thi năm trước. Hệ thống dùng AI để:

1. **Trích xuất toàn bộ kiến thức** từ slide thành database concept/example/formula có cấu trúc (KHÔNG tóm tắt, giữ nguyên văn — xem Section 5.3 Content Fidelity Pipeline).
2. Generate flashcard set (verbatim-first) và quiz adaptive từ knowledge database.
3. Dự đoán câu hỏi có khả năng cao xuất hiện trong đề thi, dựa trên đề cương + đề thi cũ crowdsource.
4. Chat RAG với nội dung môn học để hỏi đáp trọng tâm, cite page nguồn.
5. Bản outline navigation (heading + 3-dòng/section) để user điều hướng — KHÔNG phải tài liệu học chính.

**Một câu pitch:** *"App AI Việt giúp bạn qua môn trong 3 ngày — upload slide, AI lo phần còn lại."*

**Slogan TikTok:** *"Ôn Kinh tế vi mô 3 ngày, được 8.5."*

---

## 2. Target user & thị trường

### Primary persona
- **Sinh viên đại học Việt Nam**, năm 1-4, các trường lớn (ĐHQG, Bách Khoa, Ngoại Thương, Kinh tế, FTU, RMIT, Tôn Đức Thắng...).
- **Hành vi**: không học đều trong kỳ, cuối kỳ cần cày cấp tốc 1-2 tuần.
- **Pain point**: slide thầy cô dày đặc 500+ trang, đề cương 30-50 câu, không biết học gì trước, sợ trượt môn.
- **Device**: chủ yếu dùng điện thoại Android + laptop cá nhân.
- **Khả năng chi trả**: 50k-150k VND/tháng cho app học tập (so sánh: Duolingo Super 160k/tháng, Netflix 80k/tháng).

### Thị trường
- **Vietnam-first**: mobile-first PWA, tiếng Việt native, payment MoMo/ZaloPay.
- **Ước tính TAM**: 2M+ sinh viên đại học active tại VN.
- **SAM giai đoạn đầu**: 200-300k sinh viên các trường top tại HN & HCM có WTP cao.

---

## 3. Core value prop & differentiation

### Value prop
Sinh viên tiết kiệm 50-70% thời gian ôn thi bằng cách để AI **trích xuất toàn bộ kiến thức từ slide** thành flashcard + quiz adaptive có cấu trúc — không mất nội dung quan trọng như khi AI thông thường "tóm tắt ngắn", vẫn trace được về page nguồn để học đúng.

### Differentiation vs competitor

| Competitor | Limitation | ÔnGấp winning angle |
|---|---|---|
| ChatGPT/Claude | Generic, không nhớ context môn, phải prompt lại mỗi lần | Môn-centric, nhớ toàn bộ slide + đề cương, chat RAG với context lớn |
| Quizlet | Không tự generate từ slide, flashcard phải nhập tay | Upload 1 lần → flashcard tự sinh, Vietnamese native |
| NotebookLM | Không Vietnamese-optimized, không gamified, không có exam prediction | Tối ưu slide VN, gamified cramming, dự đoán đề |
| Monkey/ELSA | Khác segment (English/kids) | — |
| Study Rabbit/apps cũ | Chất lượng AI kém, không focus cuối kỳ | Modern LLM, UX cramming-focused |

### Unique moats (long-term)
1. **Content Fidelity Pipeline** (xem Section 5.3) — engine extract nguyên văn kiến thức từ slide, không bị mất như AI tóm tắt thông thường. Đây là **core differentiator kỹ thuật**, chính xác là pain point mà ChatGPT/NotebookLM đang làm tệ cho sinh viên VN (tóm tắt ngắn, mất công thức, mất ví dụ, paraphrase sai thuật ngữ chuyên ngành).
2. **Dữ liệu đề thi cũ crowdsource theo môn/trường** — flywheel: càng nhiều user cùng môn → dự đoán đề càng chính xác → thu hút thêm user.
3. **Slide parsing tối ưu cho format Việt Nam** — `marker` + OCR tiếng Việt handle slide bullet dày, mixed code/công thức, scan kém.
4. **Campus community** — nhóm học theo lớp/môn, flashcard set share viral trong lớp.

---

## 4. User flow MVP

### 4.1 Onboarding (một lần)
1. Login bằng Google (đa số sinh viên VN có Gmail).
2. Chọn trường (dropdown 30+ trường lớn, tự nhập nếu không có).
3. Chọn ngành + năm học (optional, dùng để gợi ý môn).

### 4.2 Tạo môn học (subject)
1. Tên môn (vd: "Kinh tế vi mô").
2. Mã môn (vd: "ECON101") — optional, dùng để match crowdsource.
3. Ngày thi — dùng để tính countdown và urgency.

### 4.3 Upload tài liệu
- Drag-drop hoặc tap upload:
  - **Slide bài giảng** (.pdf, .pptx) — bắt buộc, có thể upload nhiều file.
  - **Đề cương** (.pdf, .docx, paste text) — optional nhưng khuyến khích.
  - **Đề thi năm trước** (.pdf, ảnh chụp) — optional, user được "tín dụng" cho việc đóng góp.
- Processing (hiển thị progress bar, 2-5 phút tùy kích thước, xem Section 5.3):
  1. Parse → structured Markdown (giữ heading, page, bảng, công thức).
  2. Heading-aware chunking.
  3. Multi-pass extraction 3 lens (Concept / Example / Formula) song song.
  4. Coverage audit → re-process gap nếu có.
  5. Embed entries + chunks vào pgvector.
  6. Generate flashcard, quiz, exam prediction, outline nav từ entries.

### 4.4 Study mode (core loop)
Người dùng thấy dashboard môn học:
- **🗺️ Outline / Bản đồ môn học** — heading hierarchy + 3 dòng mỗi section, để navigate (KHÔNG phải tài liệu học chính).
- **🎴 Flashcard** — swipe Tinder-style, "Thuộc/Chưa thuộc", spaced repetition (SM-2 light). Mặt sau verbatim từ slide + citation page.
- **📝 Quiz adaptive** — trắc nghiệm + tự luận ngắn, sai thì gặp lại sớm hơn, cover toàn bộ entries.
- **🔮 Dự đoán đề** — "Top 10 câu có khả năng cao" với confidence score và link tới entries nguồn.
- **💬 Chat** — hỏi AI bất cứ gì về nội dung môn (RAG), trả lời có cite page + heading.
- **⚠️ Báo thiếu** — nút "Phần X chưa có" → gap report, system re-process chunk tương ứng.

### 4.5 Progress & gamification
- **Streak** theo ngày (kiểu Duolingo).
- **Countdown** tới ngày thi — hiển thị lớn, tạo urgency.
- **% hoàn thành** từng slide/chương.
- **Leaderboard** trong môn (nếu có >3 người cùng mã môn/trường).

---

## 5. Kiến trúc kỹ thuật

### 5.1 Stack

**2 phase deployment** — quan trọng vì solo dev không có ngân sách API ban đầu:

#### Phase 0 — Prototype (Tuần 1-6 MVP, beta 5-20 user)
**Target: zero API cost — dùng hoàn toàn Claude Code SDK qua subscription + local embedding. KHÔNG dùng Gemini hay API key nào khác.**

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **PWA:** next-pwa
- **API/Auth/DB/Storage:** Supabase free tier (Postgres + pgvector + Auth + Storage)
- **Frontend hosting:** Vercel free tier
- **Worker (AI pipeline)** — chạy **local máy bạn** hoặc **VPS $5/tháng** (DigitalOcean/Vultr) vì Claude Code SDK cần Claude CLI authenticated:
  - **Claude Code SDK** (Node.js) gọi Claude qua subscription → **$0 cost**
  - **Claude Sonnet 4.6** (`claude-sonnet-4-6`) cho coverage audit + exam prediction + generation chất lượng cao
  - **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) cho: extraction (batched), chat RAG, OCR vision (multimodal)
  - Queue jobs: Supabase Realtime (row insert trigger) hoặc polling đơn giản mỗi 5s
- **Local embedding (không dùng API):**
  - Thư viện: `@xenova/transformers` (Transformers.js) — chạy ONNX model trên Node.js
  - Model: `Xenova/multilingual-e5-base` (768 dims, support tiếng Việt, ~280MB)
  - Throughput dự kiến: ~10-30 chunk/giây trên CPU laptop thường → đủ cho prototype
  - Ưu điểm: $0 cost, không rate limit, offline
- **Parsing libs (free, local):** `marker` (PDF học thuật), `mammoth` (DOCX), `pptx-parser` (PPTX); fallback `unstructured`
- **Payment:** chưa cần trong Phase 0 (nếu có paid feature thì mock UI, bật sau)
- **Analytics:** Posthog free tier
- **Error tracking:** Sentry free tier

**Giới hạn subscription Claude (rate limit theo tier):**
| Tier | Giá | Msg/5h | Phù hợp cho |
|---|---|---|---|
| Pro | $20/tháng | ~45 | Dev solo test 1-2 document/ngày |
| Max 5x | $100/tháng | ~225 | **Beta 5-20 user (khuyến nghị Phase 0)** |
| Max 20x | $200/tháng | ~900 | Gần production, 30-50 user |

**Tối ưu rate limit (xem Section 5.3 Bước 3 chi tiết):**
- **Batch extraction**: gom 5 chunks vào 1 prompt Haiku call thay vì 1 chunk/call → giảm ~5x số call.
- **Document 50 trang** (~30 chunks) → trước 30 extraction calls + 1 audit call = 31 calls. Sau batch: ~6 extraction + 1 audit = **7 Claude calls / document**.
- Max 5x tier (225 msg/5h) → xử lý được ~30 document/5h = 150 document/ngày → đủ dư cho 20-30 active user.

**Yêu cầu worker:**
- Node.js 20+ với Claude CLI đã login (`claude login`).
- Phải luôn online (máy bạn bật 24/7, hoặc VPS $5/tháng).
- Khi hit rate limit → enqueue, retry sau 5-15 phút (cron polling).

#### Phase 1 — Production (sau khi có ~50 paid user, ~$200/tháng revenue)
**Migrate sang API key để scale (giữ Claude, vẫn không dùng Gemini):**

- Worker chuyển từ Claude Code SDK → **Anthropic API key** (Sonnet 4.6 + Haiku 4.5) — chỉ đổi cách auth, code logic giữ nguyên.
- Embedding: cân nhắc giữ Transformers.js self-host (vẫn $0) hoặc chuyển sang managed (Voyage AI / Cohere Embed) nếu cần quality cao hơn cho RAG tiếng Việt.
- Worker deploy: migrate từ local/VPS sang container trên Fly.io/Railway, hoặc serverless queue (Inngest, Upstash) + API call.
- Thêm MoMo/ZaloPay API cho payment thật.
- Supabase upgrade Pro $25/tháng khi vượt free tier.

**Migration gate:** khi revenue đủ trả $200-300/tháng infra/API. Không migrate sớm — prototype phải validate PMF trước.

### 5.2 Data model (Postgres)

```
users(id, email, google_id, university, major, year, created_at)
subjects(id, user_id, name, code, exam_date, created_at)

documents(id, subject_id, type, file_url, parsed_markdown, page_count, status, created_at)
-- parsed_markdown: output của Bước 1 (structured MD)

chunks(id, document_id, heading_path, page_from, page_to, content_md, token_count, embedding vector(768))
-- heading_path: "Chương 2 > 2.3 Cầu thị trường"; content_md giữ nguyên format

entries(id, subject_id, source_chunk_id, type, payload_json, importance, page_ref, embedding vector(768))
-- type ∈ {concept, example, formula}
-- payload_json: schema theo type (Concept/Example/Formula như Section 5.3 Bước 3)
-- Đây là tier LƯU TRỮ kiến thức nguyên gốc, KHÔNG bao giờ nén

coverage_audits(id, subject_id, outline_json, gaps_json, coverage_pct, audited_at)
-- kết quả Bước 4 coverage audit

summaries(id, subject_id, outline_md, version)
-- chỉ là navigation layer, build từ heading + 3-dòng/heading

flashcards(id, subject_id, entry_id, front, back_verbatim, back_paraphrase, page_ref, difficulty)
-- 1 entry (concept) → 1 flashcard chính; back_verbatim ưu tiên hiển thị

flashcard_reviews(id, flashcard_id, user_id, rating, next_review_at)

quizzes(id, subject_id, entry_id, question, options_json, correct_answer, explanation, type)
-- liên kết tới entry nguồn để traceability

quiz_attempts(id, quiz_id, user_id, answer, correct, attempted_at)

exam_predictions(id, subject_id, topic, question_sample, confidence, source_entries[], source_past_exams[])

past_exams(id, subject_code, university, year, content, uploaded_by_user_id, verified)

gap_reports(id, subject_id, user_id, description, status, created_at)
-- user report "thiếu phần X" → re-process

subscriptions(id, user_id, plan, status, momo_ref, started_at, expires_at)
```

### 5.3 AI pipeline chi tiết (Content Fidelity Pipeline)

**Nguyên tắc cốt lõi:** KHÔNG bao giờ "tóm tắt" tài liệu ở tier lưu trữ. Luôn **extract** nội dung nguyên gốc theo schema. Summary chỉ là layer navigation, không phải tài liệu học.

**Khi user upload slide:**

**Bước 1 — PDF/DOCX/PPTX → Structured Markdown**
- Primary: `marker` (open source, tối ưu cho PDF học thuật, giữ heading/table/math/công thức).
- Fast path: `pdf-parse` + `mammoth` cho doc text đơn giản.
- OCR fallback: **Claude Haiku 4.5 vision** (multimodal) cho slide scan/ảnh chụp, handle tiếng Việt tốt. Gửi page ảnh dưới dạng base64 + prompt "OCR kỹ, giữ format, preserve công thức, chỉ output plain text/markdown".
- Output: Markdown có heading hierarchy, page markers, bảng dạng MD table, công thức LaTeX/verbatim.

**Bước 2 — Heading-aware chunking**
- Split theo heading cấp 1/2 của tài liệu (không split arbitrary theo token).
- Mỗi chunk = 1 topic hoàn chỉnh, budget 1500-3000 token.
- Overlap 200 token giữa chunk kề để không đứt concept tại biên.
- Metadata mỗi chunk: heading path (VD: `Chương 2 > 2.3 Cầu thị trường`), page range.

**Bước 3 — Batched structured extraction (Claude Haiku 4.5, 3 lens)**
Sử dụng **Claude Haiku 4.5** qua Claude Code SDK với structured output (yêu cầu JSON theo schema cố định, validate bằng Zod khi parse):

- **Pass A — Concepts**: *"Liệt kê TẤT CẢ khái niệm và định nghĩa trong đoạn này. Giữ nguyên văn định nghĩa nếu có thể."* → `Concept { name, definition_verbatim, importance_1_5, related[], page }`
- **Pass B — Examples**: *"Liệt kê TẤT CẢ ví dụ, case study, tình huống minh họa."* → `Example { description, context, concept_ref, page }`
- **Pass C — Formulas/Rules**: *"Liệt kê TẤT CẢ công thức, số liệu, quy tắc, mô hình."* → `Formula { expression, variables, conditions, page }`

**Batch strategy (quan trọng, vì subscription rate limit):**
- Gom **5 chunks/call**, mỗi call vẫn chạy 3 pass (nhưng 3 pass trong 1 prompt dạng multi-section output) → 1 call extract cho 5 chunks × 3 lens.
- Output JSON array có `chunk_id` để phân loại lại entries về đúng chunk.
- Document 30 chunks → 6 batched calls extraction + 1 call audit = **7 Claude calls/document**, thay vì 90 calls nếu 3 pass x 30 chunks riêng.
- Retry cơ chế: nếu parse JSON fail hoặc output cắt giữa chừng (token limit) → tự động chia batch nhỏ hơn (3 chunks) và retry.

Mỗi chunk → ra 5-20 entries (không phải 1 đoạn tóm tắt). Ưu tiên **correctness over speed** — thà chậm 1 document vài phút nhưng coverage đầy đủ.

**Bước 4 — Coverage audit**
- LLM thứ 2 (Claude Sonnet 4.6, chất lượng cao hơn) nhận:
  - Outline đầy đủ (heading MD gốc)
  - Toàn bộ entries đã trích từ bước 3
- Prompt audit: *"Có heading/topic nào trong outline mà không có concept tương ứng trong entries không? List ra các gap cụ thể."*
- Nếu có gap → tự động re-process chunk đó với prompt focused hơn (tối đa 2 lần retry).
- Hiển thị user: *"Đã phân tích 96% nội dung tài liệu."*

**Bước 5 — Embedding & indexing (local, $0)**
- Embed TẤT CẢ entries (Concept/Example/Formula) + chunks gốc bằng `@xenova/transformers` local model `multilingual-e5-base` (768 dims).
- Chạy trong worker process, không gọi API.
- Throughput dự kiến: ~10-30 chunk/giây trên CPU; batch 32 vector/lần để tối ưu.
- Insert vào pgvector với metadata (type, heading_path, page, source_chunk_id).
- Retrieval tier giữ NGUYÊN VĂN — không bao giờ mất kiến thức.
- Lưu ý `multilingual-e5-base` yêu cầu prefix `"query: "` cho query text và `"passage: "` cho document text — phải implement đúng.

**Bước 6 — Generation layer (từ entries, không từ tóm tắt)**
- **Summary nav**: outline tự động từ heading + 3 dòng tóm tắt mỗi heading. *Mục đích: navigation, không phải tài liệu học.*
- **Flashcard**: 1 Concept → 1 flashcard chính + variants. Mặt sau **ưu tiên verbatim** từ source + citation page. Guarantees coverage (không miss concept nào).
- **Quiz**: sample từ entries (weighted theo importance) để mix trắc nghiệm + tự luận.
- **Exam prediction**: match đề cương ↔ entries; match đề thi cũ ↔ entries; combine score.

**Khi user chat (RAG):**
1. Embed câu hỏi local (Transformers.js, prefix `"query: "`) → vector search top-K entries + chunks trong môn.
2. Re-rank theo heading relevance + entry type.
3. Prompt Claude Haiku 4.5 qua Claude Code SDK với context + câu hỏi → answer có cite page + heading source.
4. Khi hit rate limit subscription → queue câu hỏi, báo user "đang xử lý" + retry sau N phút (không fallback sang provider khác ở Phase 0).

**Quality gates:**
- Parse fail (>10% trang không extract được text) → báo user, gợi ý re-upload hoặc chuyển sang OCR mode.
- Extraction quá ít entries (< 5 entries / 10 trang) → re-process với prompt khác.
- Coverage audit <85% → warn user + retry gap chunks.

### 5.4 Chi phí vận hành dự kiến

#### Phase 0 — Prototype (0-50 user)
- **Claude Sonnet 4.6 + Haiku 4.5 qua Code SDK**: **Claude Max 5x ~$100/tháng** (khuyến nghị cho beta, xem rate limit ở 5.1) — có thể chỉ Pro $20/tháng nếu dev solo test 1-2 user, nhưng không chịu được beta 10+.
- **Embedding local** (Transformers.js): $0 (chạy trong worker, 1 lần download model ~280MB)
- **OCR vision**: $0 — dùng Claude Haiku 4.5 trong cùng subscription tier, không tốn thêm.
- **Supabase**: $0 (free tier)
- **Vercel frontend**: $0 (free tier)
- **Worker hosting**: $0 (máy bạn) hoặc $5/tháng (VPS cơ bản)
- **Domain**: ~$10/năm (ongap.com / .vn / .app)
- **Tổng Phase 0: $20-105/tháng (tùy Pro/Max 5x) + $10/năm domain.**
- Nếu đã có sẵn Claude Max subscription → marginal cost gần như $0.

#### Phase 1 — Production (1000 MAU, 500 active/tháng)
Migrate sang Anthropic API key. Ước tính mỗi user upload 5 môn × 50 trang/kỳ:
- **Claude Haiku 4.5 extraction (batched)**: ~$40-70/tháng
- **Claude Sonnet 4.6 coverage audit + exam prediction**: ~$80-120/tháng
- **Claude Haiku 4.5 chat RAG + OCR**: ~$20-40/tháng
- **Embedding**: $0 nếu giữ Transformers.js self-host; hoặc ~$10/tháng nếu chuyển sang Voyage AI (optional, chỉ khi quality RAG không đủ)
- Supabase Pro: $25/tháng
- Vercel: $0/tháng (free tier đủ cho frontend)
- Worker (Fly.io / Railway): $10-20/tháng
- Payment gateway fee (MoMo ~2%): phụ thuộc revenue
- **Tổng Phase 1: $175-285/tháng cho 1000 MAU.**

#### Break-even math
- Phase 0: hòa vốn gần như tức thì (chỉ cần 1-2 paid user để trả VPS + domain).
- Phase 1 (sau migrate): cần revenue ~$300/tháng = ~7.5M VND/tháng
  - = 76 paid user ở 99k/tháng, hoặc 150 paid ở mix plan (ARPU ~50k)
  - Với 1-2% free-to-paid: cần 7500-15000 free user → đạt ở tháng 3-6 sau public launch nếu GTM OK.

#### Trigger migrate Phase 0 → Phase 1
- Worker subscription rate limit hit >3 lần/tuần, HOẶC
- Có >30 paid user active, HOẶC
- Revenue >= $150/tháng ổn định 2 tháng liên tiếp

#### Cost optimization khi scale
- Cache extraction result theo hash slide (user khác cùng môn, cùng trường upload slide giống nhau → hit cache, giảm cost ~40-60%)
- Run audit Sonnet 4.6 chỉ cho paid user (free user dùng basic heading-count audit)
- Batch embedding calls
- Free tier giới hạn 1 môn / 50 flashcard giảm extraction workload

---

## 6. Go-to-market (VN)

### Launch strategy
1. **Beta kín** (tuần 5-6 MVP): 20-30 sinh viên tại 2-3 trường bạn biết trực tiếp. Feedback loop nhanh.
2. **Soft launch** trước kỳ thi cuối kỳ 1 (tháng 12) hoặc kỳ 2 (tháng 5). Timing cực kỳ quan trọng.
3. **Facebook groups**: post organic vào group "Sinh viên [tên trường]", "Ôn thi [môn X]".
4. **TikTok**: tạo account, quay 10-15 video dạng "app AI giúp qua môn Y" với kết quả cụ thể.
5. **Campus ambassador**: 1 người/trường, miễn phí premium + 20% hoa hồng trên doanh thu giới thiệu.

### Viral mechanic
- Share flashcard set cho bạn cùng lớp qua link → bạn vào dùng → counter "X người trong lớp đã dùng".
- Refer 3 bạn → free 1 tháng premium.
- Share kết quả kỳ thi lên story FB → tag app → giảm 30k kỳ tiếp.

### Pricing
- **Free**: 1 môn active, 50 flashcard tổng, 2 quiz set, 20 chat message/tháng, không có exam prediction.
- **Premium 99k VND/tháng** — unlimited môn, unlimited flashcard/quiz, exam prediction, priority processing, offline mode.
- **Kỳ (4 tháng) 249k VND** — tiết kiệm ~30%.
- **Năm 399k VND** — tiết kiệm ~60%, target sinh viên năm 1-2 còn học nhiều năm.

Target: 1-2% free-to-paid conversion, ARPU ~$3-4/tháng.

---

## 7. Roadmap MVP 6 tuần (solo dev)

| Tuần | Deliverable |
|---|---|
| 1 | Scaffold Next.js + Supabase Auth Google + DB schema + landing page tĩnh + **Worker Node.js setup với Claude Code SDK** (test gọi Sonnet 4.6 & Haiku 4.5) + **Transformers.js local embedding PoC** (load `multilingual-e5-base`, embed vài câu tiếng Việt) |
| 2 | Upload → `marker` PDF parse + DOCX/PPTX parse + OCR **Claude Haiku vision** fallback → structured MD trong Storage. Worker nhận job qua Supabase Realtime queue |
| 3 | Heading-aware chunker + **batched multi-pass extraction (Claude Haiku 4.5, 5 chunks/call, 3 lens Concept/Example/Formula)** + entries table + local embedding insert pgvector |
| 4 | Coverage audit (Claude Sonnet 4.6) + flashcard verbatim-first + quiz generation + UI flashcard/quiz |
| 5 | Chat RAG (Claude Haiku 4.5) + exam prediction (basic Sonnet) + streak/progress + **mock paywall** (hiển thị UI premium nhưng free cho beta) |
| 6 | Polish UX mobile, landing page marketing, beta 5-10 user thật, fix critical bugs |

**Gates mỗi tuần:**
- **Tuần 1**: user đăng ký Google thành công, thấy dashboard trống, tạo được subject. Worker local chạy, gọi Sonnet 4.6 + Haiku 4.5 thành công qua Code SDK. Embed 1 câu tiếng Việt local → ra vector 768 dims.
- **Tuần 2**: upload PDF 20 trang → worker pick job → output structured MD với heading preserved trong DB, hiển thị preview cho user. OCR fallback Haiku vision test trên 1 slide scan.
- **Tuần 3**: upload slide → entries table có ≥30 concept/example/formula cho môn sample, verbatim definition đúng nguồn. Batched extraction 5 chunks/call chạy OK, không hit rate limit với 1 document.
- **Tuần 4**: coverage audit chạy OK, báo % coverage; flashcard gen từ entries, trace được về page nguồn; full loop học 1 môn E2E.
- **Tuần 5**: chat RAG trả lời có cite page + heading nguồn; UI paywall hiển thị nhưng free cho tất cả beta.
- **Tuần 6**: 5 beta user dùng thật, NPS ≥ 7/10, parse-success rate ≥ 90% trên 20 slide thực tế.

**Post-MVP (Phase 0 extension, trước khi migrate Phase 1):**
- MoMo/ZaloPay integration thật (khi có ~20 user muốn trả)
- Campus ambassador recruitment
- Content marketing TikTok

**Nếu slip timeline**: ưu tiên giữ Tuần 2-4 (core content fidelity pipeline) — đây là moat. Có thể cắt exam prediction v1 sang post-MVP nếu cần.

---

## 8. Risks & mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Mùa vụ (chỉ dùng 2 lần/năm) | Churn cao, LTV thấp | Annual plan giảm giá sâu; study companion mode cho giữa kỳ; tăng brand để user quay lại kỳ sau |
| Chất lượng parse slide tệ (format lạ, scan kém) | UX thất vọng, user bỏ | `marker` cho PDF học thuật + OCR fallback Claude Haiku vision; beta test 20+ slide thực tế; báo user nếu parse fail; hiển thị preview MD để user verify |
| Hit rate limit Claude subscription khi beta | Queue chậm, user chờ lâu | Batch extraction 5 chunks/call (giảm 5x); upgrade Pro → Max 5x nếu 10+ active user; cron retry 5-15 phút; UI "đang xử lý, X phút nữa" thay vì báo lỗi |
| Local embedding Transformers.js chậm hoặc quality thấp tiếng Việt | RAG trả lời kém, extraction chậm | Benchmark Tuần 1 (PoC); nếu quality thấp → fallback BGE-M3 (1024 dims, chậm hơn nhưng tốt hơn VN); nếu chậm → giảm batch size hoặc chạy worker trên máy có GPU |
| **AI mất kiến thức khi tóm tắt** | **Vỡ value prop — lý do tồn tại của app** | **Content Fidelity Pipeline (Section 5.3): extraction thay vì summarization, multi-pass 3 lens, coverage audit bằng Sonnet 4.6, verbatim-first flashcard, entries table giữ nguyên kiến thức. Summary chỉ là nav layer.** |
| Chất lượng flashcard/quiz tiếng Việt | Mất niềm tin | Verbatim mặt sau flashcard (giảm hallucination); prompt engineering kỹ với Vietnamese academic examples; nút report/edit; accumulate feedback vào prompt |
| Bị copy bởi ChatGPT-wrapper khác | Mất lợi thế | Xây moat dữ liệu (đề thi cũ crowdsource) + UX chuyên biệt + cộng đồng theo trường |
| AI cost blowup nếu user spam | Lỗ | Rate limit per user, cache embedding, model tier (free user dùng model rẻ hơn) |
| Pháp lý (copyright slide của trường) | Có thể bị yêu cầu gỡ | Slide là private cho mỗi user, không public; ToS rõ user tự chịu trách nhiệm nguồn tài liệu |
| Sinh viên VN ít trả tiền online | Conversion thấp | Payment qua MoMo/ZaloPay (không cần thẻ); giá điểm rơi ~99k (so với Netflix 80k); annual discount |

---

## 9. Success metrics (MVP)

**North Star:** Số môn học được "hoàn thành ôn" (user đạt >80% flashcard thuộc + >70% quiz đúng).

**Tháng 1 sau launch:**
- 500 đăng ký
- 100 upload tài liệu
- 20 paid subscription
- Retention D7: 30%

**Tháng 3:**
- 5000 đăng ký
- 100 paid subscription active
- NPS >= 40
- Organic viral coefficient >= 0.3

---

## 10. Phạm vi loại trừ (KHÔNG làm trong MVP)

- ❌ Android/iOS native app → PWA đủ
- ❌ Video giảng bài / học liệu bản quyền → chỉ xử lý tài liệu user upload
- ❌ Live tutor / chat với giảng viên thật → pure AI
- ❌ Marketplace flashcard paid (seller) → future
- ❌ Tích hợp LMS trường (Moodle...) → future
- ❌ Ngoại ngữ, thi IELTS/TOEIC → khác segment, future vertical
- ❌ Học sinh cấp 3 ôn đại học → future segment

---

## 11. Quyết định & câu hỏi còn mở

### Đã quyết (2026-04-23)
1. ✅ **Brand name:** **ÔnGấp** (tiếng Việt, dễ nhớ, phản ánh đúng use case — ôn thi cấp tốc).
2. ✅ **Legal entity:** Chưa đăng ký công ty trong Phase 0 — xem như personal project cho đến khi có PMF + revenue đều. Chỉ đăng ký domain (ongap.com / ongap.vn / ongap.app — check available).
3. ✅ **Kiến trúc Phase 0:** Dùng Claude Code SDK (subscription) thay API key → zero API cost giai đoạn prototype. Worker chạy local hoặc VPS $5/tháng. Migrate sang paid API khi đạt trigger ở Section 5.4.
4. ✅ **Crowdsource đề thi cũ:** Upload tự do, **không moderation ban đầu**. Rủi ro accepted:
   - Privacy: ToS yêu cầu user chỉ upload tài liệu họ có quyền chia sẻ.
   - Accuracy: đánh dấu "unverified" cho đề thi mới upload; khi có ≥3 user confirm → "verified". Có flag report abuse.

### Chưa quyết (để sau)
5. ⏳ **Credit cho user đóng góp đề thi:** tạm chưa tính, sẽ quyết sau khi có user thực tế test flow crowdsource (target: cuối Phase 0). Option sẽ đưa ra sau:
   - A. Credit nội bộ (unlock premium feature tạm thời)
   - B. Discount tiền mặt vào subscription
   - C. Leaderboard reputation (non-monetary)

### Cần check trước khi implementation
- [ ] Domain **ongap.com / ongap.vn / ongap.app** có available không? (tuần 1)
- [ ] Test `marker` tool parse thử 3-5 slide học thuật VN khác nhau → chất lượng MD output có OK không? (tuần 1-2)
- [ ] Test Claude Code SDK gọi Claude Sonnet 4.6 + Haiku 4.5 từ Node.js worker → latency, streaming, structured output JSON có stable không? (tuần 1)
- [ ] PoC Transformers.js với `Xenova/multilingual-e5-base` trên CPU laptop: load model, embed 100 câu tiếng Việt, đo throughput. Target ≥10 chunk/giây. (tuần 1)
- [ ] Test batched extraction (5 chunks/call Haiku 4.5) trên 1 document 50 trang → có hit rate limit Max 5x không, output JSON có parse được không? (tuần 3)
- [ ] Test Claude Haiku vision OCR trên 3-5 slide scan tiếng Việt → chất lượng so với `marker` thuần? (tuần 2)

---

**Next step:** Invoke `writing-plans` skill để tạo implementation plan chi tiết cho MVP 6 tuần.
