import UIKit
import WebKit
import UserNotifications

extension Notification.Name {
    static let pushStatusChanged = Notification.Name("LuckyJet2X.pushStatusChanged")
}

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window

        UNUserNotificationCenter.current().delegate = self
        requestPushPermission(application)
        return true
    }

    private func requestPushPermission(_ application: UIApplication) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            UserDefaults.standard.set(granted, forKey: "pushPermissionGranted")
            if let error {
                UserDefaults.standard.set(error.localizedDescription, forKey: "pushRegistrationError")
            }
            DispatchQueue.main.async {
                NotificationCenter.default.post(name: .pushStatusChanged, object: nil)
                if granted { application.registerForRemoteNotifications() }
            }
        }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: "apnsDeviceToken")
        UserDefaults.standard.removeObject(forKey: "pushRegistrationError")
        PushRegistrationService.shared.register(token: token)
        NotificationCenter.default.post(name: .pushStatusChanged, object: nil)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        UserDefaults.standard.set(error.localizedDescription, forKey: "pushRegistrationError")
        NotificationCenter.default.post(name: .pushStatusChanged, object: nil)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NotificationCenter.default.post(name: Notification.Name("LuckyJet2X.reload"), object: nil)
        completionHandler()
    }
}

private final class PushRegistrationService {
    static let shared = PushRegistrationService()

    private struct Payload: Codable {
        let token: String
        let bundleId: String
        let platform: String
        let appVersion: String
    }

    func register(token: String) {
        guard
            let rawURL = Bundle.main.object(forInfoDictionaryKey: "PushRegistrationURL") as? String,
            !rawURL.isEmpty,
            let url = URL(string: rawURL)
        else { return }

        let payload = Payload(
            token: token,
            bundleId: Bundle.main.bundleIdentifier ?? "com.miuiproking.luckyjet2x",
            platform: "ios",
            appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        )
        guard let body = try? JSONEncoder().encode(payload) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let secret = Bundle.main.object(forInfoDictionaryKey: "PushRegistrationSecret") as? String, !secret.isEmpty {
            request.setValue(secret, forHTTPHeaderField: "X-Registration-Secret")
        }
        URLSession.shared.dataTask(with: request).resume()
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate {
    private let appURL = URL(string: "https://miuiproking.github.io/MiuiProKing/fixed-2x.html?v=ipa-1")!
    private var webView: WKWebView!
    private let pushButton = UIButton(type: .system)
    private var errorAlertVisible = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.02, blue: 0.08, alpha: 1)

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.customUserAgent = "LuckyJet2X-iOS/1.0"
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        pushButton.translatesAutoresizingMaskIntoConstraints = false
        pushButton.setTitle("🔔", for: .normal)
        pushButton.titleLabel?.font = .systemFont(ofSize: 20)
        pushButton.backgroundColor = UIColor.black.withAlphaComponent(0.72)
        pushButton.layer.cornerRadius = 22
        pushButton.layer.borderWidth = 1
        pushButton.layer.borderColor = UIColor.systemGreen.cgColor
        pushButton.accessibilityLabel = "Статус уведомлений"
        pushButton.addTarget(self, action: #selector(showPushStatus), for: .touchUpInside)
        view.addSubview(pushButton)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            pushButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12),
            pushButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            pushButton.widthAnchor.constraint(equalToConstant: 44),
            pushButton.heightAnchor.constraint(equalToConstant: 44)
        ])

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(refreshPage(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        NotificationCenter.default.addObserver(self, selector: #selector(updatePushButton), name: .pushStatusChanged, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(reloadPage), name: Notification.Name("LuckyJet2X.reload"), object: nil)
        updatePushButton()
        loadPage()
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func loadPage() {
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25))
    }

    @objc private func reloadPage() { loadPage() }

    @objc private func refreshPage(_ sender: UIRefreshControl) {
        loadPage()
        sender.endRefreshing()
    }

    @objc private func updatePushButton() {
        let token = UserDefaults.standard.string(forKey: "apnsDeviceToken")
        let granted = UserDefaults.standard.bool(forKey: "pushPermissionGranted")
        pushButton.layer.borderColor = (token != nil ? UIColor.systemGreen : granted ? UIColor.systemOrange : UIColor.systemRed).cgColor
    }

    @objc private func showPushStatus() {
        let token = UserDefaults.standard.string(forKey: "apnsDeviceToken")
        let error = UserDefaults.standard.string(forKey: "pushRegistrationError")
        let granted = UserDefaults.standard.bool(forKey: "pushPermissionGranted")
        let message: String
        if let token {
            message = "APNs подключён.\n\nDevice Token:\n\(token)"
        } else if let error {
            message = "APNs пока не подключён:\n\(error)\n\nПроверьте профиль подписи с Push Notifications."
        } else {
            message = granted ? "Разрешение получено, ожидаю APNs Device Token." : "Разрешите уведомления в настройках iPhone."
        }
        let alert = UIAlertController(title: "Уведомления LuckyJet 2X", message: message, preferredStyle: .alert)
        if let token {
            alert.addAction(UIAlertAction(title: "Скопировать Token", style: .default) { _ in UIPasteboard.general.string = token })
        }
        alert.addAction(UIAlertAction(title: "Открыть настройки", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        })
        alert.addAction(UIAlertAction(title: "Закрыть", style: .cancel))
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorAlertVisible = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showNetworkError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showNetworkError(error)
    }

    private func showNetworkError(_ error: Error) {
        guard !errorAlertVisible else { return }
        errorAlertVisible = true
        let alert = UIAlertController(title: "Нет подключения", message: "Не удалось открыть LuckyJet 2X. Проверьте интернет и повторите.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Повторить", style: .default) { [weak self] _ in self?.errorAlertVisible = false; self?.loadPage() })
        present(alert, animated: true)
    }
}
