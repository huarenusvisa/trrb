import XCTest
@testable import TangDailyMac

final class ArticleTests: XCTestCase {
    func testStringAndNumericIDsProduceValidURLs() throws {
        for json in [#"{"id":"article/a?b=1","title":"新闻"}"#, #"{"id":42,"title":"新闻"}"#] {
            let article = try JSONDecoder().decode(Article.self, from: Data(json.utf8))
            let components = URLComponents(url: article.url, resolvingAgainstBaseURL: false)!
            XCTAssertEqual(components.host, "trrb.net")
            XCTAssertEqual(components.path, "/article.html")
            XCTAssertEqual(components.queryItems, [URLQueryItem(name: "id", value: article.id)])
        }
    }
    func testBookmarkRoundTripPreservesArticle() throws {
        let original = try JSONDecoder().decode(Article.self, from: Data(#"{"id":"123","title":"任免动态","summary":"背景","category_name":"中国政治","cover_image":null,"published_at":"2026-09-17"}"#.utf8))
        XCTAssertEqual(try JSONDecoder().decode(Article.self, from: JSONEncoder().encode(original)), original)
    }
    func testFocusFeedDoesNotRequirePaginationFields() throws {
        let feed = try JSONDecoder().decode(Feed.self, from: Data(#"{"articles":[{"id":12,"title":"要闻"}]}"#.utf8))
        XCTAssertEqual(feed.articles.count, 1)
        XCTAssertNil(feed.has_more)
    }
}
