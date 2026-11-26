# İZ – Birlikte Birikenler

İki kişinin ortak anılarını kelime oyunlarına dönüştüren iOS/Android uygulaması için Expo + TypeScript başlangıç projesi.

> **Durum:** Bu paket çalışan bir yerel MVP/teknik temelidir; mağazaya hazır, tam çok oyunculu ürün değildir. Günlükler cihazda saklanır. Supabase şeması ve AI Edge Function entegrasyon başlangıcı dahildir. Kimlik doğrulama ekranı, davet akışı, sunucu otoriteli gerçek zamanlı düello, tam dokunmatik çengel ızgarası, yasal içerik doğrulama ve uçtan uca iki cihaz testleri henüz tamamlanmamıştır.

## Özellikler

- Sıcak krem/petrol yeşili görsel kimlik ve beş bölümlü alt navigasyon.
- Yerel günlük kaydı; ortak/kişisel görünürlük işareti.
- Türkçe karakter duyarlı cevap normalizasyonu ve harf sayımı.
- 14 soruluk klasik tur seti doğrulaması (4–10 harf, her uzunluktan iki soru).
- Harf açma, tahmin kontrolü ve puan fonksiyonları.
- Çengel/ok bulmaca yerleşim motoru; geçersiz kesişimleri reddeden doğrulama.
- Supabase Postgres şeması, RLS başlangıç politikaları ve ortak alan davet RPC'leri.
- Sunucu tarafında OpenAI Responses API kullanan günlük analiz Edge Function taslağı.

## Gereksinimler

- Node.js 22.13 veya üzeri
- npm
- Expo Go (hızlı yerel önizleme) veya EAS Development Build
- Bulut özellikleri için Supabase hesabı

## Yerelde çalıştırma

```bash
npm install
npx expo install --fix
cp .env.example .env
# .env dosyasına Supabase Project URL ve Publishable Key girin
npx expo start
```

Terminalde çıkan QR kodu iPhone'da Expo Go ile okutun. SDK 58 ile eşleşen Expo Go sürümünü kullanın. Native özellikleri olan dağıtım için EAS Development Build tercih edin.

## Testler

```bash
npm test
npm run typecheck
npx expo-doctor
```

## Supabase kurulumu

1. Supabase'te yeni proje oluşturun.
2. SQL Editor'da `supabase/migrations/0001_initial_schema.sql` dosyasını çalıştırın.
3. Project URL ve Publishable Key değerlerini `.env` dosyasına girin.
4. Edge Function'ı deploy edin:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set OPENAI_API_KEY=YOUR_SERVER_SIDE_KEY
npx supabase secrets set OPENAI_MODEL=gpt-5-mini
npx supabase functions deploy analyze-entry
```

`SUPABASE_SERVICE_ROLE_KEY` Supabase Edge Functions ortamında bulunur; hiçbir koşulda mobil `.env` içine eklenmemelidir. OpenAI API anahtarı da yalnızca Edge Function secret olarak tutulmalıdır.

## GitHub'a yükleme

GitHub hesabını bağladıktan sonra GitHub üzerinde `iz-birlikte-birikenler` adlı boş bir repository oluşturun. Ardından proje klasöründe:

```bash
git init
git add .
git commit -m "Initial IZ mobile app foundation"
git branch -M main
git remote add origin https://github.com/USERNAME/iz-birlikte-birikenler.git
git push -u origin main
```

## Telefona kurulabilir sürüm (EAS)

Önce Expo hesabı açın ve `eas-cli` yükleyin:

```bash
npm install -g eas-cli
eas login
eas init
```

`app.json` içindeki `extra.eas.projectId` alanı `eas init` tarafından verilen proje kimliğiyle güncellenmelidir.

Android test APK:

```bash
eas build --platform android --profile preview
```

iOS dağıtımı (TestFlight/App Store imzalama ve Apple Developer hesabı gerekir):

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

EAS build çıktısı Android APK veya iOS IPA'dır. Expo Go QR önizlemesi mağaza uygulaması değildir.

## Mimari notlar / üretime geçmeden önce

- Oyun cevabı ve puan hesaplaması istemciye bırakılmamalı. Üretim sürümünde oyun başlatma, harf açma, cevap gönderme ve puan yazma işlemleri Edge Function/RPC üzerinden atomik yapılmalı.
- `player_game_states` deadline değerleri sunucu saatine göre belirlenmeli; istemci yalnızca gösterim sayacı çalıştırmalı.
- `journal_entries` SELECT RLS kuralı özel kayıtları yalnızca yazara gösterir. AI analiz fonksiyonu yalnızca `visibility='shared'` kayıtları kabul eder.
- AI tarafından önerilen kelime ve sorular sözlük/haricî kaynak doğrulaması olmadan kesin doğru sayılmamalıdır. Şu anki analiz Edge Function AI taslak değerlendirmesi yapar; bağımsız sözlük doğrulama servisi değildir.
- Çengel motoru şu an kelime yerleşimi/kesişme çekirdeğidir; gazetelerdeki tam dolu ve dengeli çengel sayfası üretimi, dokunmatik hücre editörü ve ortak çözüm event kanalı sonraki aşamadır.

## Önerilen geliştirme sırası

1. Auth ekranları ve iki üyeli davet akışı.
2. Günlüklerin Supabase'e taşınması, realtime abonelik ve fotoğraf depolama.
3. AI aday çıkarımı + bağımsız sözlük doğrulama + soru hakemliği.
4. Sunucu otoriteli 240 sn düello ve oyuncu başına 30 sn cevaplama durumu.
5. Tam etkileşimli çengel ızgarası ve ortak çözüm senkronizasyonu.
6. E2E iki cihaz testleri, gizlilik/silme/dışa aktarma, erişilebilirlik ve mağaza dağıtımı.
