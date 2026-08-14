# LuckyJet 2X для iPhone

Нативная оболочка открывает актуальную страницу `fixed-2x.html` и поддерживает
удалённые уведомления Apple. В открытом приложении анализ работает на телефоне.
Когда приложение закрыто, анализ выполняет процесс из папки `server`, а iPhone
получает сигнал через APNs.

## Подпись IPA

- Bundle ID: `com.miuiproking.luckyjet2x`
- Минимальная версия: iOS 15
- Нужная capability для закрытых уведомлений: Push Notifications
- Entitlement: `aps-environment`

Обычная подпись без Push Notifications установит приложение, но Apple не выдаст
Device Token. После установки нажмите 🔔: зелёная рамка и 64-значный token означают,
что APNs работает. Универсальные сертификаты сторонних подписчиков часто не дают
собственный APNs entitlement — это ограничение Apple, а не приложения.

GitHub Actions собирает `LuckyJet2X-unsigned.ipa`. Её можно переподписать своим
сертификатом и provisioning profile.

