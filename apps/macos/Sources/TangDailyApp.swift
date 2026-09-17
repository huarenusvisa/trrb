import SwiftUI
import WebKit
import AppKit

struct Article: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let summary: String?
    let category_name: String?
    let cover_image: String?
    let published_at: String?
    enum CodingKeys: String, CodingKey { case id, title, summary, category_name, cover_image, published_at }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let s = try? c.decode(String.self, forKey: .id) { id = s } else { id = String(try c.decode(Int.self, forKey: .id)) }
        title = try c.decode(String.self, forKey: .title)
        summary = try c.decodeIfPresent(String.self, forKey: .summary)
        category_name = try c.decodeIfPresent(String.self, forKey: .category_name)
        cover_image = try c.decodeIfPresent(String.self, forKey: .cover_image)
        published_at = try c.decodeIfPresent(String.self, forKey: .published_at)
    }
    var url: URL { var c = URLComponents(string: "https://trrb.net/article.html")!; c.queryItems = [URLQueryItem(name: "id", value: id)]; return c.url! }
}
struct Feed: Decodable { let articles: [Article]; let has_more: Bool? }

@MainActor final class Library: ObservableObject {
    @Published var saved: [Article] = []
    init() { if let data = UserDefaults.standard.data(forKey: "mac.saved.articles"), let value = try? JSONDecoder().decode([Article].self, from: data) { saved = value } }
    func toggle(_ article: Article) {
        if saved.contains(where: { $0.id == article.id }) { saved.removeAll { $0.id == article.id } } else { saved.insert(article, at: 0) }
        if let data = try? JSONEncoder().encode(saved) { UserDefaults.standard.set(data, forKey: "mac.saved.articles") }
    }
}
@MainActor final class NewsStore: ObservableObject {
    @Published var articles: [Article] = []
    @Published var loading = false
    @Published var error: String?
    @Published var more = false
    private var generation = UUID()
    func load(section: String, query: String, append: Bool = false) async {
        let token = UUID(); generation = token
        loading = true; error = nil
        defer { if token == generation { loading = false } }
        let focus = section == "重要新闻" && query.isEmpty
        let editorial = ["中国政治", "美国执法与警情"].contains(section)
        let endpoint = focus ? "public-home-focus" : editorial ? "public-editorial-articles" : "public-articles"
        var c = URLComponents(string: "https://trrb.net/.netlify/functions/\(endpoint)")!
        c.queryItems = [URLQueryItem(name: "limit", value: "30"),URLQueryItem(name: "offset", value: String(append ? articles.count : 0))]
        if !query.isEmpty { c.queryItems?.append(URLQueryItem(name: "q", value: query)) }
        if !focus && section != "最新新闻" && section != "重要新闻" { c.queryItems?.append(URLQueryItem(name: "category", value: section == "中国热门头条" ? "热门头条" : section)) }
        do {
            var request = URLRequest(url: c.url!); request.timeoutInterval = 20
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
            let feed = try JSONDecoder().decode(Feed.self, from: data)
            guard token == generation, !Task.isCancelled else { return }
            if append { let ids = Set(articles.map(\.id)); articles += feed.articles.filter { !ids.contains($0.id) } } else { articles = feed.articles }
            more = !focus && (feed.has_more ?? false)
        } catch is CancellationError { } catch {
            guard token == generation else { return }
            self.error = "暂时无法加载新闻，请检查网络后重试。"
        }
    }
}

@main struct TangDailyApp: App {
    @StateObject private var library = Library()
    var body: some Scene {
        WindowGroup { DesktopView().environmentObject(library).tint(Color(red: 0.71, green: 0.05, blue: 0.09)).preferredColorScheme(.light).frame(minWidth: 980, minHeight: 680) }
            .defaultSize(width: 1440, height: 900)
            .commands { SidebarCommands(); CommandGroup(after: .help) { Link("唐人日报技术支持", destination: URL(string: "https://trrb.net/app-support.html")!) } }
    }
}
struct DesktopView: View {
    @EnvironmentObject var library: Library
    @StateObject private var store = NewsStore()
    @State private var section: String? = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix("--section=") }).map { String($0.dropFirst(10)) } ?? "重要新闻"
    @State private var search = ""
    @State private var submittedSearch = ""
    @State private var selected: Article?
    @State private var reader: Article?
    private let news = ["重要新闻","最新新闻","中国热门头条","中国政治","美国时政","美国执法与警情"]
    private let services = ["招聘求职","移民法官","唐人社区"]
    private let links = ["招聘求职":"https://huarengongzuo.com/", "移民法官":"https://asylumjudge.com/", "唐人社区":"https://trrb.net/community/"]
    private var current: String { section ?? "重要新闻" }
    private var displayed: [Article] { current == "本机收藏" ? library.saved.filter { submittedSearch.isEmpty || $0.title.localizedCaseInsensitiveContains(submittedSearch) } : store.articles }
    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 8) {
                Text("唐人日报").font(.system(size: 29, weight: .heavy)).foregroundStyle(Color(red: 0.71, green: 0.05, blue: 0.09)).padding(.horizontal, 20).padding(.top, 24)
                Text("TANG REN DAILY").font(.system(size: 10, weight: .medium)).tracking(3).foregroundStyle(.secondary).padding(.horizontal, 22)
                List(selection: $section) {
                    Section("新闻与观察") { ForEach(news, id: \.self) { name in Label(name, systemImage: name == "重要新闻" ? "newspaper" : "text.alignleft").tag(name) } }
                    Section("华人生活") { ForEach(services, id: \.self) { name in Label(name, systemImage: name == "招聘求职" ? "briefcase" : name == "移民法官" ? "chart.bar.xaxis" : "bubble.left.and.bubble.right").tag(name) } }
                    Section("阅读空间") { Label("本机收藏", systemImage: "bookmark").tag("本机收藏") }
                }.listStyle(.sidebar)
                Text("立足美国 · 服务华人").font(.caption).foregroundStyle(.secondary).padding(20)
            }.navigationSplitViewColumnWidth(min: 190, ideal: 215, max: 260)
        } detail: {
            Group {
                if let address = links[current], let url = URL(string: address) { BrowserView(url: url).id(current) }
                else { newsContent }
            }
            .navigationTitle(current)
            .toolbar {
                if links[current] == nil {
                    ToolbarItem { Button { Task { await reload() } } label: { Label("刷新", systemImage: "arrow.clockwise") }.keyboardShortcut("r").disabled(store.loading) }
                }
            }
        }
        .searchable(text: $search, prompt: "搜索新闻")
        .onSubmit(of: .search) { submittedSearch = search.trimmingCharacters(in: .whitespacesAndNewlines); Task { await reload() } }
        .onChange(of: section) { _ in selected = nil; submittedSearch = ""; search = "" }
        .task(id: section) { await reload() }
        .sheet(item: $reader) { article in
            VStack(spacing: 0) {
                HStack { Text(article.title).font(.headline).lineLimit(1); Spacer(); ShareLink(item: article.url); Button("关闭") { reader = nil }.keyboardShortcut(.cancelAction) }.padding()
                BrowserView(url: article.url)
            }.frame(minWidth: 900, minHeight: 700)
        }
    }
    private var newsContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 8) { Text(current).font(.system(size: 32, weight: .bold)); Text(current == "本机收藏" ? "收藏保存在这台 Mac，方便稍后阅读" : "中美时事与华人生活，持续更新").foregroundStyle(.secondary) }
                Spacer(); if store.loading { ProgressView().controlSize(.small) }
            }.padding(26)
            Divider()
            if let error = store.error, current != "本机收藏" { HStack { Label(error, systemImage: "wifi.exclamationmark"); Button("重试") { Task { await reload() } } }.padding().foregroundStyle(.secondary) }
            if displayed.isEmpty && !store.loading {
                Spacer(); HStack { Spacer(); VStack(spacing: 12) { Image(systemName: "newspaper").font(.largeTitle); Text(current == "本机收藏" ? "还没有收藏的文章" : "暂无新闻，请刷新或更换关键词").foregroundStyle(.secondary) }; Spacer() }; Spacer()
            } else {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 290, maximum: 520), spacing: 20)], alignment: .leading, spacing: 20) {
                        ForEach(displayed) { article in
                            VStack(alignment: .leading, spacing: 12) {
                                Button { reader = article } label: {
                                    VStack(alignment: .leading, spacing: 12) {
                                        if let value = article.cover_image, let url = URL(string: value), url.scheme == "https" {
                                            AsyncImage(url: url) { image in image.resizable().scaledToFill() } placeholder: { Rectangle().fill(Color.secondary.opacity(0.08)).overlay(Image(systemName: "newspaper").foregroundStyle(.secondary)) }.frame(height: 166).clipped().clipShape(RoundedRectangle(cornerRadius: 9))
                                        }
                                        Text(article.category_name ?? "唐人日报").font(.caption).foregroundStyle(.red)
                                        Text(article.title).font(.system(size: 18, weight: .semibold)).foregroundStyle(.primary).lineLimit(3).frame(maxWidth: .infinity, alignment: .leading)
                                        if let summary = article.summary { Text(summary).font(.system(size: 13)).foregroundStyle(.secondary).lineLimit(3) }
                                    }.contentShape(Rectangle())
                                }.buttonStyle(.plain)
                                HStack {
                                    Text(String((article.published_at ?? "").prefix(10))).font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Button { library.toggle(article) } label: { Image(systemName: library.saved.contains(where: { $0.id == article.id }) ? "bookmark.fill" : "bookmark") }.help("收藏或取消收藏").buttonStyle(.borderless)
                                    ShareLink(item: article.url).labelStyle(.iconOnly)
                                }
                            }.padding(16).background(.background).clipShape(RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.secondary.opacity(0.16)))
                        }
                    }.padding(24)
                    if store.more && current != "本机收藏" { Button("加载更多") { Task { await store.load(section: current, query: submittedSearch, append: true) } }.disabled(store.loading).padding(.bottom, 24) }
                }.background(Color(red: 0.96, green: 0.96, blue: 0.97))
            }
        }
    }
    private func reload() async { if links[current] == nil && current != "本机收藏" { await store.load(section: current, query: submittedSearch) } }
}

@MainActor final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let web = WKWebView()
    @Published var loading = true
    @Published var failed = false
    override init() { super.init(); web.navigationDelegate = self; web.uiDelegate = self; web.allowsBackForwardNavigationGestures = true }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { loading = true; failed = false }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { failed = true; loading = false } }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { self.webView(webView, didFail: navigation, withError: error) }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if ["https","http","about"].contains(url.scheme ?? "") { decisionHandler(.allow) }
        else { if ["mailto","tel"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil, let url = action.request.url, ["https","http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; return nil
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) { let panel = NSOpenPanel(); panel.allowsMultipleSelection = parameters.allowsMultipleSelection; panel.canChooseDirectories = false; panel.begin { response in completionHandler(response == .OK ? panel.urls : nil) } }
}
struct BrowserView: View {
    let url: URL
    @StateObject private var model = BrowserModel()
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { model.web.goBack() } label: { Image(systemName: "chevron.left") }.help("返回")
                Button { model.web.goForward() } label: { Image(systemName: "chevron.right") }.help("前进")
                Button { model.web.reload() } label: { Image(systemName: "arrow.clockwise") }.help("刷新")
                Text(url.host ?? "唐人日报").font(.caption).foregroundStyle(.secondary)
                Spacer(); if model.loading { ProgressView().controlSize(.small) }
                ShareLink(item: url).labelStyle(.iconOnly)
                Link(destination: url) { Image(systemName: "safari") }.help("在浏览器中打开")
            }.buttonStyle(.borderless).padding(12)
            Divider()
            if model.failed { HStack { Text("页面加载失败，请检查网络后重试。"); Button("重试") { model.web.load(URLRequest(url: url)) } }.padding() }
            WebSurface(web: model.web)
        }.task(id: url) { model.web.load(URLRequest(url: url)) }
    }
}
struct WebSurface: NSViewRepresentable {
    let web: WKWebView
    func makeNSView(context: Context) -> WKWebView { web }
    func updateNSView(_ nsView: WKWebView, context: Context) { }
}
