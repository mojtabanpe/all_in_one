import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  private var windowChannel: FlutterMethodChannel?

  override func awakeFromNib() {
    let controller = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = controller
    self.setFrame(NSRect(x: windowFrame.minX, y: windowFrame.minY, width: 1200, height: 820), display: true)
    self.minSize = NSSize(width: 480, height: 480)
    self.center()
    RegisterGeneratedPlugins(registry: controller)

    let channel = FlutterMethodChannel(
      name: "ir.poshtetgarm.hybrid/window", binaryMessenger: controller.engine.binaryMessenger)
    windowChannel = channel
    channel.setMethodCallHandler { [weak self] call, result in
      if call.method == "ready" {
        // Configure menus after Flutter has initialized its default menu delegate.
        DispatchQueue.main.async {
          self?.configureMenus()
          result(nil)
        }
      } else {
        result(FlutterMethodNotImplemented)
      }
    }
    super.awakeFromNib()
  }

  private func configureMenus() {
    if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
       let icon = NSImage(contentsOf: iconURL) {
      NSApp.applicationIconImage = icon
    }
    if let appMenu = NSApp.mainMenu?.items.first?.submenu,
       let settings = appMenu.items.first(where: { $0.keyEquivalent == "," }) {
      settings.title = "App address…"
      settings.target = self
      settings.action = #selector(showAppAddress(_:))
    }
    if let viewMenu = NSApp.mainMenu?.items.first(where: { $0.title == "View" })?.submenu {
      guard !viewMenu.items.contains(where: { $0.action == #selector(reloadPage(_:)) }) else { return }
      let items: [(String, Selector, String)] = [
        ("Go back", #selector(goBack(_:)), "["),
        ("Go forward", #selector(goForward(_:)), "]"),
        ("Reload", #selector(reloadPage(_:)), "r")
      ]
      for (index, item) in items.enumerated() {
        let menuItem = NSMenuItem(title: item.0, action: item.1, keyEquivalent: item.2)
        menuItem.target = self
        menuItem.keyEquivalentModifierMask = [.command]
        viewMenu.insertItem(menuItem, at: index)
      }
      viewMenu.insertItem(.separator(), at: items.count)
    }
  }

  @objc private func showAppAddress(_ sender: Any?) { windowChannel?.invokeMethod("showSettings", arguments: nil) }
  @objc private func reloadPage(_ sender: Any?) { windowChannel?.invokeMethod("reload", arguments: nil) }
  @objc private func goBack(_ sender: Any?) { windowChannel?.invokeMethod("goBack", arguments: nil) }
  @objc private func goForward(_ sender: Any?) { windowChannel?.invokeMethod("goForward", arguments: nil) }
}
