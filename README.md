# EditSync Stüdyo

Kısa dikey videolar (Reels / TikTok / Shorts) için yerel, tarayıcıda çalışan bir edit stüdyosu.
Konuşan kafa videonun üstüne **zamana kilitli HTML sahneler** koyarsın, **kelime kelime altyazıyı** düzenlersin, zaman çizelgesinde kesip kaydırırsın ve **kare kare doğru MP4** alırsın.

*A local, browser-based studio for short vertical videos: time-locked HTML motion segments over a talking-head video, word-level subtitles, a timeline, SFX and frame-exact MP4 export.*

## Hızlı başlangıç

```bash
git clone https://github.com/<you>/editsync-studio
cd editsync-studio
npm install
npx playwright install chromium   # sadece MP4 export için
npm start                         # http://localhost:5176/studio/
```

Gereken: Node 18+, `ffmpeg` (PATH'te). Repo örnek bir demo videosu, bir örnek sahne ve kelime zamanlamasıyla gelir; ilk açılışta direkt çalışır.

## Kendi videonla kullanmak

| Dosya | Ne |
|---|---|
| `work/head_proxy.mp4` | Stüdyonun oynattığı video (önerilen: 720×1280 ya da 540×960, H.264, `-g 15`). |
| `work/words.txt` | Kelime zamanlamaları (aşağıdaki format). Altyazılar buradan gelir. |
| `studio/segments.json` | Video yolu, süre ve sahne listesi. |
| `dist/*.html` | Sahne sayfaların (motion grafik, kartlar, yazılar). |
| `work/shots.json` *(isteğe bağlı)* | Sahne kesimleri `[{ "id", "s", "e", "f" }]` — altyazılar kesimde biter, zaman çizelgesinde görünür. |

Proxy üretmek için:

```bash
ffmpeg -i kaynak.mp4 -vf scale=720:1280 -c:v libx264 -crf 20 -g 15 -keyint_min 15 -c:a aac -movflags +faststart work/head_proxy.mp4
```

### `words.txt` formatı

```
[ 0.20- 3.40] Cümlenin tamamı.
  0.20  Cümlenin
  0.85  tamamı.
```

Her kelime satırı: boşluk + başlangıç saniyesi + kelime. Whisper / herhangi bir transkript aracının kelime zamanlamalarından kolayca üretilir.

### Sahne sayfası sözleşmesi

Bir sahne sayfası **zamanın saf fonksiyonudur**. Stüdyo, önizleme ve export için sayfadaki `__bm.seek(t)`'yi çağırır (`t` = sahne başından itibaren saniye):

```js
window.__bm = {
  duration: 4,          // saniye
  size: [1080, 1920],   // sayfanın kendi tuval boyutu
  alpha: true,          // şeffaf zemin: video arkadan görünür
  seek(t) { /* her şeyi t'den hesapla — timer / CSS animation yok */ },
};
```

Örnek: [`dist/example.html`](dist/example.html).

## Altyazılar

- **Öbekleme:** kelimeler noktalama ve konuşmadaki duraklamalara göre 1–3 kelimelik doğal öbekler halinde gelir ("ve, ama" yeni öbeği açar; "ki, de, ile" öbeğe başlamaz). "en fazla N kelime" ile sınır değişir.
- Kelimeye **tık** → o saniyeye git · **Ctrl+tık** → aç/kapat · **Shift+tık** → oradan böl / sonrakiyle birleştir · **çift tık** → metni düzelt.
- **Süre:** zaman çizelgesindeki *Altyazı* şeridinde blokların kenarlarını sürükle (çift tık: otomatiğe dön). "bekleme" kaydırıcısı son kelimeden sonra ne kadar kalacağını, "sahne kesiminde bitir" kesimi geçmemeyi ayarlar.
- 16 hazır stil (koyu şeffaf kutu, karaoke, editoryal…), renkler, konum (önizlemede sürükle), SRT dışa aktarma.

## Diğer

Zaman çizelgesi (sahne kırpma/kaydırma, işaretler `M`), notlar, varyantlar, SFX şeridi, müzik, Ctrl+Z / Ctrl+Shift+Z, güvenli alan kılavuzu, telefon önizlemesi, 1× / 2× (4K) MP4 export.

Kendi sürümünü yapmak için forkla: stüdyo tek klasör (`studio/`), bağımlılık sadece Playwright (export için).

## Lisans

MIT — `studio/fonts/` altındaki fontlar SIL Open Font License 1.1 ile dağıtılır.
