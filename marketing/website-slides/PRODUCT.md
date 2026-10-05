# clickgroup.site "Our Systems" image — Restaurant POS System

Upload at https://www.clickgroup.site/admin/products → edit **Restaurant POS System** → **Product Image**:

`out/product-restaurant-pos.jpg` (2000×1250, ~140 KB)

Check how it looks first in `out/preview/`:
- `product-desktop.jpg` (Kurdish, the site default)
- `product-desktop-en.jpg` (English)
- `product-tablet.jpg`
- `product-mobile.jpg`

## Why it's built this way
The card fills its left half with the image, edge to edge (`object-cover`). The shape of that half changes with screen size:

| Screen | Panel shape | What gets cut |
|---|---|---|
| Laptop (1440px) | ~1.3 : 1 | a little off the left and right |
| Tablet (640–1023px) | up to ~2.2 : 1 | the top and bottom |
| Phone | ~1 : 1 | a third off the sides |

On top of that, the bottom ~40% is darkened and covered by the product name, tagline and button.

So the devices sit in a centre "safe zone", and the bottom of the image is a plain dark counter for the text to sit on.
The admin hint "800 × 500" is the right shape (16:10). This file is the same shape at 2.5× the size, so it stays sharp on retina screens.

## Optional: feature list that matches the real system
The current feature list on the card is generic, and "Multi-branch management" may not match what ClickGroup actually sells.
Here is a list taken from the real app. Paste it into the same product's fields only if you want it:

- Tag EN: `Complete Restaurant Control` · Tag KU: `کۆنترۆڵی تەواوی ڕێستۆرانت` (unchanged)
- Description EN: `One system for your whole café or restaurant — cashier, kitchen screen, QR menu, delivery, inventory and reports, with apps for Windows, Android and web, fully in Kurdish.`
- Description KU: `یەک سیستەم بۆ هەموو کافێ و ڕێستۆرانتەکەت — کاشێر، شاشەی چێشتخانە، مینیوی QR، گەیاندن، کۆگا و ڕاپۆرت، بە ئەپ بۆ ویندۆز، ئەندرۆید و وێب، بە تەواوی بە کوردی`

| Feature EN | Feature KU |
|---|---|
| Fast cashier POS — photo menu, discounts, split bills | کاشێری خێرا — مینیوی وێنەدار، داشکاندن، دابەشکردنی حیساب |
| Kitchen Display (KDS) with automatic printing | شاشەی چێشتخانە (KDS) و چاپی خۆکار |
| QR table ordering & one-tap waiter call | داواکاری بە QR و بانگکردنی گارسۆن بە یەک کلیک |
| Delivery with driver app & WhatsApp updates | گەیاندن بە ئەپی شۆفێر و ئاگادارکردنەوەی واتساپ |
| Inventory with low-stock alerts | کۆگا و ئاگادارکردنەوەی کەمبوونی کاڵا |
| Sales, expense & profit reports | ڕاپۆرتی فرۆش، خەرجی و قازانج |
| Staff roles & permissions — Kurdish, Arabic, English | ڕۆڵ و مۆڵەتی ستاف — کوردی، عەرەبی، ئینگلیزی |

## Re-rendering
The scene is `#product-restaurant-pos` in `slides.html`.
Run `node render.js product` to re-render just this image and its previews.
To check the card live, open `product-preview.html` (Kurdish) or `product-preview.html?ku=0` (English) in a browser and resize the window.
