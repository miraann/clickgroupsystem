# clickgroup.site homepage slides — ClickGroup restaurant system

Upload at https://www.clickgroup.site/admin/slides → **Add Slide**, one per block below.
Images are in `out/`. Check how each one looks first in `out/preview/` (desktop + mobile).

| Admin field | Which file |
|---|---|
| Background Image | `out/NN-*-background.jpg` |
| Character / Product Image | `out/NN-*-character.webp` (transparent) |

Turn off the old seed slides (or drag these above them). Keep 4–6 slides **Live** at a time.

The "Our Systems" product image is a separate file. See [PRODUCT.md](PRODUCT.md).

---

## 01 · All-in-one
- Background: `01-all-in-one-background.jpg` · Character: `01-all-in-one-character.webp`
- Background Theme: **Deep Blue**
- Title EN: `All-in-One Restaurant System`
- Title KU: `سیستەمی تەواوی بەڕێوەبردنی کافێ و ڕێستۆرانت`
- Subtitle EN: `Orders, menu, kitchen, delivery, inventory and reports — all in one place, fully in Kurdish.`
- Subtitle KU: `داواکاری، مینیو، چێشتخانە، گەیاندن، کۆگا و ڕاپۆرت — هەمووی لە یەک شوێن، بە تەواوی بە کوردی`
- CTA: `داوای نمایش بکە` / `Book a Demo` → `#contact`

## 02 · Cashier POS
- Background: `02-pos-background.jpg` · Character: `02-pos-character.webp`
- Background Theme: **Amber Dusk**
- Title EN: `Lightning-Fast Cashier POS`
- Title KU: `فرۆشتنی خێرا بە چەند کلیکێک`
- Subtitle EN: `Photo menu, discounts, split bills, any payment method and Kurdish receipts on thermal printers.`
- Subtitle KU: `مینیوی ڕێکخراو بە وێنە و پۆل، داشکاندن، دابەشکردنی حیساب و پسوولەی کوردی بە چاپکەری گەرمی`
- CTA: `زیاتر بزانە` / `Learn More` → `#systems`

## 03 · Kitchen display (KDS)
- Background: `03-kds-background.jpg` · Character: `03-kds-character.webp`
- Background Theme: **Crimson**
- Title EN: `Paperless Kitchen Display`
- Title KU: `داواکاری ڕاستەوخۆ دەگاتە چێشتخانە`
- Subtitle EN: `Every order reaches the kitchen screen instantly — with a timer on each ticket and automatic printing.`
- Subtitle KU: `هەر داواکارییەک ڕاستەوخۆ دەگاتە شاشەی چێشتخانە — کاتژمێر بۆ هەر داواکارییەک و چاپی خۆکار`
- CTA: `زیاتر بزانە` / `Learn More` → `#systems`

## 04 · QR menu
- Background: `04-qr-menu-background.jpg` · Character: `04-qr-menu-character.webp`
- Background Theme: **Purple Night**
- Title EN: `Scan, Order, Enjoy`
- Title KU: `میوان خۆی داوا دەکات`
- Subtitle EN: `Guests scan the table QR, browse your menu with photos and offers, order and call the waiter in one tap.`
- Subtitle KU: `میوان کۆدی مێزەکە سکان دەکات، مینیو بە وێنە و ئۆفەرەوە دەبینێت و بە یەک کلیک داوا دەکات`
- CTA: `زیاتر بزانە` / `Learn More` → `#systems`

## 05 · Delivery
- Background: `05-delivery-background.jpg` · Character: `05-delivery-character.webp`
- Background Theme: **Ocean**
- Title EN: `Real-Time Delivery Tracking`
- Title KU: `گەیاندنی خێرا لە ژێر چاودێریدا`
- Subtitle EN: `A dedicated driver app, customer location on the map and automatic WhatsApp updates for every order.`
- Subtitle KU: `ئەپی تایبەت بۆ شۆفێر، شوێنی کڕیار لەسەر نەخشە و ئاگادارکردنەوەی واتساپ بۆ هەر داواکارییەک`
- CTA: `زیاتر بزانە` / `Learn More` → `#systems`

## 06 · Reports
- Background: `06-reports-background.jpg` · Character: `06-reports-character.webp`
- Background Theme: **Teal Night**
- Title EN: `Live Sales Dashboard`
- Title KU: `هەموو ژمارەکان لە بەردەستتدان`
- Subtitle EN: `Daily, monthly and yearly reports — sales, inventory alerts, expenses, profit and staff permissions.`
- Subtitle KU: `ڕاپۆرتی ڕۆژانە، مانگانە و ساڵانە — فرۆش، کۆگا، خەرجی، قازانج و مۆڵەتی ستاف`
- CTA: `داوای نمایش بکە` / `Book a Demo` → `#contact`

---

## Design rules for future slides

These come from how `components/HeroSlider.tsx` treats each image.

**Background image:** the slider blurs it 3px, slowly zooms it 10%, and darkens it.
On desktop the left side is darkened 92% and the right side only 20%. On phones it's 78% everywhere.
- Detail is lost, so use colour and light: bokeh, night-time café or kitchen photos, light trails.
- Put the brightest, most colourful part on the **right**. That's the only part people really see.
- 1920×1080 JPG, under ~300 KB.
- Real photos of your client cafés at night work very well. The blur hides any mess.

**Character / product image:** a transparent cut-out pinned to the **bottom-right**, 88% of the slider height and about 44% of the width. On phones it shows above the text at 42% height.
- Make it **square** (1600×1600) and keep the visual weight at the bottom. Leave ~5% empty margin at the top and right, or the edge gets cut.
- The site adds a gold glow around the image's shape. A clean cut-out looks rich; a plain rectangular screenshot looks flat.
- Show the **real product with Kurdish UI**, not stock photos. No competitor can copy that.
- Layer it: one hero device, one secondary object (receipt printer, QR card, ticket), and 2–3 floating cards (notification, timer, stat). Tilt the device toward the text.
- Don't put headlines inside the image. The slider already writes the title and subtitle, and baked-in text breaks on phones.

**Text:** the slider colours the **middle word** of the English title gold. It picks word number ⌊n/2⌋, counting from 0, so with 3 words it's the 2nd word.
Write titles so the key word lands there, e.g. "Paperless **Kitchen** Display".
Note: `subtitle_ku` is saved but the slider currently shows only `subtitle_en`.

**Variety:** give each slide its own colour mood and pick the matching Background Theme, so the carousel doesn't look like one slide six times.

## Editing / re-rendering
Everything is HTML in `slides.html`. The device screens reuse the promo video's mockups.
1. Change the text or layout in `slides.html`.
2. From this folder, run `node render.js`. It writes `out/` and `out/preview/` in about 30 s.
3. Open `preview.html?i=0` … `?i=5` in a browser to check a slide live. Resize below 1024px for the phone layout.
