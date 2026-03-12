---
name: "login-animations"
description: "Designs tasteful login-page animations (CSS/Tailwind, optional libraries). Invoke when user asks to improve a login screen with animation or a modern background."
---

# Login Animations

## Amaç

Login ekranlarını daha modern göstermek için performans dostu arka plan animasyonları, kart geçişleri ve mikro animasyonlar uygular.

## Ne zaman kullanılır

- Kullanıcı login sayfasını “daha modern / animasyonlu / daha güzel” yapmak istediğinde
- Arka plan (gradient / blob / grid / aurora) animasyonu istendiğinde
- Harici animasyon kütüphanesi (framer-motion, lottie) değerlendirilmesi istendiğinde

## Varsayılan yaklaşım

1. Önce mevcut UI stilini ve global CSS/Tailwind düzenini incele.
2. Yeni bağımlılık eklemeden, CSS keyframes ile hafif animasyonlar uygula:
   - Animated gradient (arka plan)
   - Floating blobs (blur’lu organik şekiller)
   - Subtle grid/particles overlay
   - Card giriş animasyonu (fade/slide)
3. `prefers-reduced-motion` ile animasyonları devre dışı bırak.

## Kütüphane ekleme kararı

Kütüphane ekleme sadece şu durumlarda önerilir:

- Kullanıcı özellikle Lottie/Framer Motion istiyor
- Karmaşık timeline animasyonları gerekiyor
- Tasarım sisteminde zaten bu bağımlılıklar kullanılıyor

## Kontrol listesi

- Animasyonlar 60fps’e yakın, düşük CPU kullanımlı olmalı
- Mobilde okuma/kontrast iyi olmalı (kart arka planı yeterince opak)
- Form alanları ve butonlar erişilebilir olmalı
- `prefers-reduced-motion` desteklenmeli

## Örnek desenler

### Animated gradient + floating blobs (CSS)

- Global CSS’e `login-bg`, `login-grid`, `animate-blob-*` keyframes ekle
- Login sayfasında arka plan overlay’lerini `pointer-events-none` ile pasif yap
- Kartı yarı saydam + blur ile netleştir

