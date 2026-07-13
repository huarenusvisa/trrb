// Legacy compatibility endpoint.
// All ICE user-report review and publishing now uses the integrated,
// server-side original-submission lock. This prevents an old cached admin
// page from bypassing the same publication rules.
exports.handler = require("./ice-report-integrated").handler;
