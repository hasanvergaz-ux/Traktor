# Köy Traktör Oyunu

Tarayıcıda çalışan 3D traktör oyunu: gerçekçi dokulu köy haritası, arka kaldırıcı (3 nokta askı) ve kazayağı ile toprak işleme, çamurlu çukurlar, gece/gündüz, motor sesi ve ağır korna.

## Çalıştırma

Bilgisayarında [Node.js](https://nodejs.org) (20 veya üstü) ya da [Bun](https://bun.sh) kurulu olmalı.

```bash
npm install      # veya: bun install
npm run dev      # veya: bun run dev
```

Sonra terminalde yazan adresi (genelde http://localhost:8080 veya http://localhost:3000) tarayıcıda aç.

Testleri çalıştırmak için: `npm test`

## Kontroller

| Tuş | İş |
| --- | --- |
| K | Kontak (motoru çalıştır / durdur) |
| W / S (veya ↑ / ↓, Boşluk) | Gaz / fren |
| A / D (veya ← / →) | Direksiyon |
| R | İleri ⇄ geri vites |
| E / Q | Arka kolları kaldır / indir |
| T | Aleti tak / çıkar |
| H | Korna |
| C | Kamera değiştir |
| L / J / B | Far / iş lambası / çakar |
| N | Gece ⇄ gündüz |
| O | Kaputu aç / kapat |
| F1 | Tuş listesi |

Telefonda ekrandaki düğmeler kullanılır.

## Klasörler (başka bir yapay zekaya anlatırken işine yarar)

- `src/game/sim/` – Oyunun kuralları: harita ve arazi yüksekliği (`world.ts`), traktör fiziği (`tractor.ts`), arka askı ve kazayağı ölçüleri (`hitch.ts`), sürülmüş toprak haritası (`field.ts`). Testleri: `tractor.test.ts`.
- `src/game/scene/` – Ekranda çizilenler: arazi, bitkiler, evler, traktör, kazayağı, toz/duman.
- `src/game/audio/GameAudio.ts` – Motor, korna, hidrolik ve toprak sesleri.
- `src/game/ui/` – Gösterge paneli, düğmeler, mini harita.
- `src/game/Game.tsx` – Her kareyi yöneten ana döngü, kamera, ışık ve gece/gündüz.
- `public/game-assets/` – Traktör modeli, dokular, bitki görselleri ve motor sesleri.

Kullanılan teknolojiler: React 19, TanStack Start, Vite, Three.js, React Three Fiber, Tailwind CSS.
Dokular Poly Haven'dan (CC0, serbest kullanım). Traktör modeli ve motor sesi senin yüklediğin orijinal oyundan.
