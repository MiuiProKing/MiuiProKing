import UIKit
import WebKit
import AVKit
import AVFoundation
import UserNotifications

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
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        return true
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}

private protocol ControlPanelDelegate: AnyObject {
    func controlPanelDidChangeKeepAwake(_ enabled: Bool)
    func controlPanelDidChangeZoom(_ zoom: CGFloat)
    func controlPanelDidRequestPiP()
}

private final class ControlPanelViewController: UIViewController {
    weak var delegate: ControlPanelDelegate?
    private let currentKeepAwake: Bool
    private let currentZoom: CGFloat
    private let zoomValueLabel = UILabel()

    init(keepAwake: Bool, zoom: CGFloat) {
        currentKeepAwake = keepAwake
        currentZoom = zoom
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.07, green: 0.04, blue: 0.14, alpha: 1)

        let titleLabel = UILabel()
        titleLabel.text = "LuckyJet 2X V22"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)

        let subtitle = UILabel()
        subtitle.text = "Настройки экрана"
        subtitle.textColor = UIColor.white.withAlphaComponent(0.58)
        subtitle.font = .systemFont(ofSize: 14, weight: .medium)

        let keepLabel = UILabel()
        keepLabel.text = "☀️ Экран всегда включён"
        keepLabel.textColor = .white
        keepLabel.font = .systemFont(ofSize: 17, weight: .semibold)

        let keepSwitch = UISwitch()
        keepSwitch.isOn = currentKeepAwake
        keepSwitch.onTintColor = UIColor(red: 0.34, green: 0.96, blue: 0.75, alpha: 1)
        keepSwitch.addTarget(self, action: #selector(keepAwakeChanged(_:)), for: .valueChanged)

        let keepRow = UIStackView(arrangedSubviews: [keepLabel, keepSwitch])
        keepRow.axis = .horizontal
        keepRow.alignment = .center
        keepRow.distribution = .equalSpacing

        let zoomTitle = UILabel()
        zoomTitle.text = "Плотность интерфейса"
        zoomTitle.textColor = .white
        zoomTitle.font = .systemFont(ofSize: 17, weight: .semibold)

        zoomValueLabel.textColor = UIColor(red: 1, green: 0.79, blue: 0.29, alpha: 1)
        zoomValueLabel.font = .monospacedDigitSystemFont(ofSize: 16, weight: .bold)
        zoomValueLabel.textAlignment = .right
        updateZoomLabel(currentZoom)

        let zoomHeader = UIStackView(arrangedSubviews: [zoomTitle, zoomValueLabel])
        zoomHeader.axis = .horizontal
        zoomHeader.distribution = .equalSpacing

        let zoomSlider = UISlider()
        zoomSlider.minimumValue = 0.65
        zoomSlider.maximumValue = 1.15
        zoomSlider.value = Float(currentZoom)
        zoomSlider.minimumTrackTintColor = UIColor(red: 0.54, green: 0.36, blue: 0.96, alpha: 1)
        zoomSlider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.18)
        zoomSlider.addTarget(self, action: #selector(zoomChanged(_:)), for: .valueChanged)

        let zoomHint = UILabel()
        zoomHint.text = "Меньше процент — больше информации помещается на экране."
        zoomHint.textColor = UIColor.white.withAlphaComponent(0.52)
        zoomHint.font = .systemFont(ofSize: 12)
        zoomHint.numberOfLines = 0

        let pipButton = UIButton(type: .system)
        pipButton.setTitle("▣  Открыть картинку в картинке", for: .normal)
        pipButton.setTitleColor(.white, for: .normal)
        pipButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        pipButton.backgroundColor = UIColor(red: 0.34, green: 0.19, blue: 0.78, alpha: 1)
        pipButton.layer.cornerRadius = 14
        pipButton.heightAnchor.constraint(equalToConstant: 52).isActive = true
        pipButton.addTarget(self, action: #selector(openPiP), for: .touchUpInside)

        let pipHint = UILabel()
        pipHint.text = "PiP показывает компактную карточку мониторинга. Нажмите на неё, чтобы вернуться в приложение."
        pipHint.textColor = UIColor.white.withAlphaComponent(0.52)
        pipHint.font = .systemFont(ofSize: 12)
        pipHint.numberOfLines = 0

        let closeButton = UIButton(type: .system)
        closeButton.setTitle("Готово", for: .normal)
        closeButton.setTitleColor(.white, for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        closeButton.backgroundColor = UIColor.white.withAlphaComponent(0.10)
        closeButton.layer.cornerRadius = 14
        closeButton.heightAnchor.constraint(equalToConstant: 48).isActive = true
        closeButton.addTarget(self, action: #selector(closePanel), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [
            titleLabel, subtitle, keepRow, zoomHeader, zoomSlider, zoomHint,
            pipButton, pipHint, closeButton
        ])
        stack.axis = .vertical
        stack.spacing = 16
        stack.setCustomSpacing(5, after: titleLabel)
        stack.setCustomSpacing(24, after: subtitle)
        stack.setCustomSpacing(7, after: zoomHeader)
        stack.setCustomSpacing(8, after: zoomSlider)
        stack.setCustomSpacing(24, after: zoomHint)
        stack.setCustomSpacing(8, after: pipButton)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 22),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -22),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18)
        ])
    }

    private func updateZoomLabel(_ zoom: CGFloat) {
        zoomValueLabel.text = "\(Int((zoom * 100).rounded()))%"
    }

    @objc private func keepAwakeChanged(_ sender: UISwitch) {
        delegate?.controlPanelDidChangeKeepAwake(sender.isOn)
    }

    @objc private func zoomChanged(_ sender: UISlider) {
        let stepped = (CGFloat(sender.value) * 20).rounded() / 20
        updateZoomLabel(stepped)
        delegate?.controlPanelDidChangeZoom(stepped)
    }

    @objc private func openPiP() {
        dismiss(animated: true) { [weak self] in self?.delegate?.controlPanelDidRequestPiP() }
    }

    @objc private func closePanel() { dismiss(animated: true) }
}

private final class PiPMonitor: NSObject, AVPictureInPictureControllerDelegate {
    private let queuePlayer = AVQueuePlayer()
    private let playerLayer: AVPlayerLayer
    private var looper: AVPlayerLooper?
    private var controller: AVPictureInPictureController?

    var isActive: Bool { controller?.isPictureInPictureActive == true }

    override init() {
        playerLayer = AVPlayerLayer(player: queuePlayer)
        super.init()

        guard let url = Bundle.main.url(forResource: "PiPStatus", withExtension: "mp4") else { return }
        let item = AVPlayerItem(url: url)
        looper = AVPlayerLooper(player: queuePlayer, templateItem: item)
        playerLayer.videoGravity = .resizeAspect
        playerLayer.backgroundColor = UIColor.black.cgColor

        if AVPictureInPictureController.isPictureInPictureSupported() {
            let pip = AVPictureInPictureController(playerLayer: playerLayer)
            pip.delegate = self
            pip.canStartPictureInPictureAutomaticallyFromInline = true
            controller = pip
        }
    }

    func attach(to hostView: UIView) {
        playerLayer.frame = hostView.bounds
        hostView.layer.addSublayer(playerLayer)
    }

    func updateLayout(_ bounds: CGRect) { playerLayer.frame = bounds }

    func start(completion: @escaping (String?) -> Void) {
        guard let controller else {
            completion("Картинка в картинке не поддерживается на этом устройстве.")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .moviePlayback, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            completion("Не удалось включить системный видеорежим: \(error.localizedDescription)")
            return
        }

        queuePlayer.play()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            guard controller.isPictureInPicturePossible else {
                completion("PiP пока недоступен. Запустите ещё раз через секунду.")
                return
            }
            controller.startPictureInPicture()
            completion(nil)
        }
    }

    func pictureInPictureControllerDidStopPictureInPicture(_ pictureInPictureController: AVPictureInPictureController) {
        queuePlayer.pause()
    }

    func pictureInPictureController(
        _ pictureInPictureController: AVPictureInPictureController,
        failedToStartPictureInPictureWithError error: Error
    ) {
        queuePlayer.pause()
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler, ControlPanelDelegate {
    private let appURL = URL(string: "https://miuiproking.github.io/MiuiProKing/fixed-2x-v22.html?v=ipa-v22")!
    private let keepAwakeKey = "LuckyJetV22.keepAwake"
    private let zoomKey = "LuckyJetV22.zoom"
    private var webView: WKWebView!
    private let settingsButton = UIButton(type: .system)
    private let pipHostView = UIView()
    private let pipMonitor = PiPMonitor()
    private var errorAlertVisible = false
    private var keepAwake = false
    private var zoom: CGFloat = 0.85

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.02, blue: 0.08, alpha: 1)

        keepAwake = UserDefaults.standard.bool(forKey: keepAwakeKey)
        let savedZoom = UserDefaults.standard.double(forKey: zoomKey)
        if savedZoom >= 0.65 && savedZoom <= 1.15 { zoom = CGFloat(savedZoom) }
        UIApplication.shared.isIdleTimerDisabled = keepAwake

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(WeakScriptMessageHandler(target: self), name: "luckyjetStatus")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.customUserAgent = "LuckyJet2X-V22-iOS/1.0"
        webView.pageZoom = zoom
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        pipHostView.backgroundColor = .black
        pipHostView.alpha = 0.02
        pipHostView.isUserInteractionEnabled = false
        pipHostView.translatesAutoresizingMaskIntoConstraints = false
        view.insertSubview(pipHostView, belowSubview: webView)
        pipMonitor.attach(to: pipHostView)

        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        settingsButton.setTitle("⚙️", for: .normal)
        settingsButton.titleLabel?.font = .systemFont(ofSize: 21)
        settingsButton.backgroundColor = UIColor.black.withAlphaComponent(0.74)
        settingsButton.layer.cornerRadius = 24
        settingsButton.layer.borderWidth = 1
        settingsButton.layer.borderColor = UIColor(red: 0.54, green: 0.36, blue: 0.96, alpha: 1).cgColor
        settingsButton.accessibilityLabel = "Настройки экрана и PiP"
        settingsButton.addTarget(self, action: #selector(showControlPanel), for: .touchUpInside)
        view.addSubview(settingsButton)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            pipHostView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            pipHostView.topAnchor.constraint(equalTo: view.topAnchor),
            pipHostView.widthAnchor.constraint(equalToConstant: 4),
            pipHostView.heightAnchor.constraint(equalToConstant: 4),
            settingsButton.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 14),
            settingsButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -18),
            settingsButton.widthAnchor.constraint(equalToConstant: 48),
            settingsButton.heightAnchor.constraint(equalToConstant: 48)
        ])

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(refreshPage(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        loadPage()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        pipMonitor.updateLayout(pipHostView.bounds)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "luckyjetStatus")
        UIApplication.shared.isIdleTimerDisabled = false
    }

    private func loadPage() {
        webView.load(URLRequest(url: appURL, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 25))
    }

    @objc private func refreshPage(_ sender: UIRefreshControl) {
        loadPage()
        sender.endRefreshing()
    }

    @objc private func showControlPanel() {
        let panel = ControlPanelViewController(keepAwake: keepAwake, zoom: zoom)
        panel.delegate = self
        panel.modalPresentationStyle = .pageSheet
        if let sheet = panel.sheetPresentationController {
            sheet.detents = [.medium(), .large()]
            sheet.prefersGrabberVisible = true
        }
        present(panel, animated: true)
    }

    func controlPanelDidChangeKeepAwake(_ enabled: Bool) {
        keepAwake = enabled
        UserDefaults.standard.set(enabled, forKey: keepAwakeKey)
        UIApplication.shared.isIdleTimerDisabled = enabled
    }

    func controlPanelDidChangeZoom(_ newZoom: CGFloat) {
        zoom = min(1.15, max(0.65, newZoom))
        UserDefaults.standard.set(Double(zoom), forKey: zoomKey)
        webView.pageZoom = zoom
    }

    func controlPanelDidRequestPiP() {
        pipMonitor.start { [weak self] errorMessage in
            guard let errorMessage else { return }
            self?.showInfo(title: "Картинка в картинке", message: errorMessage)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "luckyjetStatus", let body = message.body as? [String: Any] else { return }
        let type = body["type"] as? String ?? "status"
        guard type == "signal" || type == "result" else { return }

        let title = body["title"] as? String ?? "LuckyJet 2X V22"
        let text = body["body"] as? String ?? "Проверьте приложение."
        if UIApplication.shared.applicationState != .active || pipMonitor.isActive {
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = text
            content.sound = .default
            let request = UNNotificationRequest(
                identifier: "luckyjet-v22-\(UUID().uuidString)",
                content: content,
                trigger: nil
            )
            UNUserNotificationCenter.current().add(request)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorAlertVisible = false
        webView.pageZoom = zoom
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showNetworkError()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showNetworkError()
    }

    private func showNetworkError() {
        guard !errorAlertVisible else { return }
        errorAlertVisible = true
        let alert = UIAlertController(
            title: "Нет подключения",
            message: "Не удалось открыть LuckyJet 2X V22. Проверьте интернет и повторите.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Повторить", style: .default) { [weak self] _ in
            self?.errorAlertVisible = false
            self?.loadPage()
        })
        present(alert, animated: true)
    }

    private func showInfo(title: String, message: String) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Понятно", style: .default))
        present(alert, animated: true)
    }
}
