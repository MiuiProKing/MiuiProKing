import UIKit
import WebKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let appURL = URL(string: "https://rt.pornhub.com/model/murstar")!
    private let zoomDefaultsKey = "MurStar.pageZoom"
    private var webView: WKWebView!
    private let settingsButton = UIButton(type: .system)
    private var errorAlertVisible = false
    private var currentZoom: CGFloat = 0.80

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.allowsPictureInPictureMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let newWindowFix = WKUserScript(
            source: """
            document.addEventListener('click', function(event) {
                const link = event.target.closest && event.target.closest('a[target="_blank"]');
                if (link) { link.target = '_self'; }
            }, true);
            """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        configuration.userContentController.addUserScript(newWindowFix)

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = true
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        currentZoom = savedPageZoom()
        webView.pageZoom = currentZoom
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        let symbolConfiguration = UIImage.SymbolConfiguration(pointSize: 18, weight: .semibold)
        settingsButton.setImage(
            UIImage(systemName: "slider.horizontal.3", withConfiguration: symbolConfiguration),
            for: .normal
        )
        settingsButton.tintColor = .white
        settingsButton.backgroundColor = UIColor.black.withAlphaComponent(0.78)
        settingsButton.layer.cornerRadius = 22
        settingsButton.layer.borderWidth = 1
        settingsButton.layer.borderColor = UIColor.systemOrange.withAlphaComponent(0.9).cgColor
        settingsButton.accessibilityLabel = "Настроить масштаб страницы"
        settingsButton.addTarget(self, action: #selector(showZoomSettings), for: .touchUpInside)
        settingsButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(settingsButton)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            settingsButton.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -10
            ),
            settingsButton.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -10
            ),
            settingsButton.widthAnchor.constraint(equalToConstant: 44),
            settingsButton.heightAnchor.constraint(equalToConstant: 44)
        ])

        let refresh = UIRefreshControl()
        refresh.tintColor = .systemOrange
        refresh.addTarget(self, action: #selector(refreshPage(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        loadPage()
    }

    private func loadPage() {
        let request = URLRequest(
            url: appURL,
            cachePolicy: .useProtocolCachePolicy,
            timeoutInterval: 30
        )
        webView.load(request)
    }

    @objc private func refreshPage(_ sender: UIRefreshControl) {
        webView.reload()
        sender.endRefreshing()
    }

    private func savedPageZoom() -> CGFloat {
        let saved = UserDefaults.standard.double(forKey: zoomDefaultsKey)
        guard saved >= 0.55, saved <= 1.20 else { return 0.80 }
        return CGFloat(saved)
    }

    private func applyPageZoom(_ zoom: CGFloat) {
        let clamped = min(max(zoom, 0.55), 1.20)
        currentZoom = clamped
        UserDefaults.standard.set(Double(clamped), forKey: zoomDefaultsKey)
        webView.pageZoom = clamped
    }

    @objc private func showZoomSettings() {
        let controller = ZoomSettingsViewController(initialZoom: currentZoom)
        controller.onZoomChanged = { [weak self] zoom in
            self?.applyPageZoom(zoom)
        }
        if let sheet = controller.sheetPresentationController {
            sheet.detents = [.medium()]
            sheet.prefersGrabberVisible = true
            sheet.preferredCornerRadius = 24
        }
        present(controller, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url,
              let scheme = url.scheme?.lowercased()
        else {
            decisionHandler(.allow)
            return
        }

        if scheme == "http" || scheme == "https" || scheme == "about" {
            decisionHandler(.allow)
            return
        }

        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil,
           let url = navigationAction.request.url,
           url.absoluteString != "about:blank" {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        errorAlertVisible = false
        webView.pageZoom = currentZoom
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showNetworkError(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        showNetworkError(error)
    }

    private func showNetworkError(_ error: Error) {
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        guard !errorAlertVisible else { return }
        errorAlertVisible = true

        let alert = UIAlertController(
            title: "Нет подключения",
            message: "Не удалось открыть страницу. Проверь интернет и повтори.",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "Повторить", style: .default) { [weak self] _ in
            self?.errorAlertVisible = false
            self?.loadPage()
        })
        present(alert, animated: true)
    }
}

final class ZoomSettingsViewController: UIViewController {
    var onZoomChanged: ((CGFloat) -> Void)?

    private let initialZoom: CGFloat
    private let percentLabel = UILabel()
    private let slider = UISlider()

    init(initialZoom: CGFloat) {
        self.initialZoom = initialZoom
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.055, green: 0.055, blue: 0.06, alpha: 1)

        let titleLabel = UILabel()
        titleLabel.text = "Масштаб страницы"
        titleLabel.textColor = .white
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)

        let descriptionLabel = UILabel()
        descriptionLabel.text = "Меньше процент — больше информации помещается на экране."
        descriptionLabel.textColor = .secondaryLabel
        descriptionLabel.font = .systemFont(ofSize: 15)
        descriptionLabel.numberOfLines = 0

        percentLabel.textColor = .systemOrange
        percentLabel.font = .monospacedDigitSystemFont(ofSize: 34, weight: .bold)
        percentLabel.textAlignment = .center

        slider.minimumValue = 0.55
        slider.maximumValue = 1.20
        slider.minimumTrackTintColor = .systemOrange
        slider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.22)
        slider.value = Float(initialZoom)
        slider.addTarget(self, action: #selector(sliderChanged), for: .valueChanged)

        let presets = [60, 70, 80, 90, 100].map { value -> UIButton in
            let button = UIButton(type: .system)
            var configuration = UIButton.Configuration.tinted()
            configuration.title = "\(value)%"
            configuration.baseForegroundColor = .systemOrange
            configuration.baseBackgroundColor = UIColor.systemOrange.withAlphaComponent(0.18)
            configuration.cornerStyle = .medium
            button.configuration = configuration
            button.tag = value
            button.addTarget(self, action: #selector(presetTapped(_:)), for: .touchUpInside)
            return button
        }

        let presetStack = UIStackView(arrangedSubviews: presets)
        presetStack.axis = .horizontal
        presetStack.spacing = 8
        presetStack.distribution = .fillEqually

        let resetButton = UIButton(type: .system)
        var resetConfiguration = UIButton.Configuration.gray()
        resetConfiguration.title = "Сбросить на 100%"
        resetConfiguration.baseForegroundColor = .white
        resetButton.configuration = resetConfiguration
        resetButton.addTarget(self, action: #selector(resetTapped), for: .touchUpInside)

        let doneButton = UIButton(type: .system)
        var doneConfiguration = UIButton.Configuration.filled()
        doneConfiguration.title = "Готово"
        doneConfiguration.baseForegroundColor = .black
        doneConfiguration.baseBackgroundColor = .systemOrange
        doneConfiguration.cornerStyle = .large
        doneButton.configuration = doneConfiguration
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [
            titleLabel,
            descriptionLabel,
            percentLabel,
            slider,
            presetStack,
            resetButton,
            doneButton
        ])
        stack.axis = .vertical
        stack.spacing = 16
        stack.setCustomSpacing(8, after: titleLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 22),
            doneButton.heightAnchor.constraint(equalToConstant: 50)
        ])

        updatePercentLabel(initialZoom)
    }

    private func setZoom(_ zoom: CGFloat) {
        let stepped = round(zoom * 20) / 20
        slider.setValue(Float(stepped), animated: true)
        updatePercentLabel(stepped)
        onZoomChanged?(stepped)
    }

    private func updatePercentLabel(_ zoom: CGFloat) {
        percentLabel.text = "\(Int(round(zoom * 100)))%"
    }

    @objc private func sliderChanged() {
        setZoom(CGFloat(slider.value))
    }

    @objc private func presetTapped(_ sender: UIButton) {
        setZoom(CGFloat(sender.tag) / 100)
    }

    @objc private func resetTapped() {
        setZoom(1.00)
    }

    @objc private func doneTapped() {
        dismiss(animated: true)
    }
}
