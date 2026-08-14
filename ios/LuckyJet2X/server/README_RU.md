# Сервер уведомлений LuckyJet 2X

Этот процесс должен работать на сервере постоянно. Он получает только завершённые
раунды из `/history`, отсеивает повторы по уникальному `id`, собирает пять новых
раундов и отправляет APNs-сигнал на первый следующий раунд.

## Запуск

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# заполните .env
uvicorn luckyjet_2x_push:app --host 0.0.0.0 --port 8080
```

Проверка: `curl http://127.0.0.1:8080/health`.

## Telegram — основной вариант для Scarlet

Укажите в `.env` значения `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`. Если группа
использует темы, дополнительно задайте `TELEGRAM_THREAD_ID`. Сервер будет
отправлять в Telegram четыре типа сообщений:

- `ПРИГОТОВЬТЕСЬ` после четырёх из пяти свежих завершённых раундов;
- `СТАВЬТЕ СЕЙЧАС • 2.00X` после подтверждения условий;
- `WIN 2X` или `LOSS 2X` по первому следующему уникальному раунду;
- после результата автоматически начинается новый анализ пяти раундов.

Telegram и APNs могут быть включены одновременно. Если IPA подписана через
Scarlet и Apple не выдаёт APNs Device Token, сообщения Telegram продолжат
приходить при закрытом приложении.

Для уведомлений нужен Apple Developer APNs Key (`.p8`), его Key ID, Team ID и
профиль подписи приложения с Push Notifications для bundle id
`com.miuiproking.luckyjet2x`. Сам файл `.p8` нельзя добавлять в GitHub.

Самый простой способ подключения iPhone: установить подписанную IPA, разрешить
уведомления, нажать кнопку 🔔, скопировать Device Token и записать его в
`APNS_DEVICE_TOKENS`. Публичный `/register` тогда не нужен.

Если у сервера есть HTTPS-адрес, задайте в репозитории GitHub Actions variable
`PUSH_REGISTRATION_URL` вида `https://server.example/register`, пересоберите IPA,
и приложение сможет регистрировать токен автоматически.
