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

Для уведомлений нужен Apple Developer APNs Key (`.p8`), его Key ID, Team ID и
профиль подписи приложения с Push Notifications для bundle id
`com.miuiproking.luckyjet2x`. Сам файл `.p8` нельзя добавлять в GitHub.

Самый простой способ подключения iPhone: установить подписанную IPA, разрешить
уведомления, нажать кнопку 🔔, скопировать Device Token и записать его в
`APNS_DEVICE_TOKENS`. Публичный `/register` тогда не нужен.

Если у сервера есть HTTPS-адрес, задайте в репозитории GitHub Actions variable
`PUSH_REGISTRATION_URL` вида `https://server.example/register`, пересоберите IPA,
и приложение сможет регистрировать токен автоматически.

