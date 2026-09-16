import Foundation
import CoreGraphics
let pid = Int(CommandLine.arguments[1])!
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
for w in list {
    if w[kCGWindowOwnerPID as String] as? Int == pid, w[kCGWindowLayer as String] as? Int == 0,
       let bounds = w[kCGWindowBounds as String] as? [String:CGFloat], (bounds["Width"] ?? 0) > 800,
       let id = w[kCGWindowNumber as String] as? Int { print(id); exit(0) }
}
fputs("No visible app window\n",stderr);exit(1)
