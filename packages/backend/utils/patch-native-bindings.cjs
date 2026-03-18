/**
 * Stub for missing native bindings on Windows.
 *
 * @drift-labs/sdk imports @triton-one/yellowstone-grpc which requires a
 * platform-specific native module that doesn't exist for Windows.
 * We don't use gRPC (BulkAccountLoader uses HTTP polling), so we stub it
 * to let the SDK load without crashing.
 *
 * Usage: node --require ./utils/patch-native-bindings.cjs ...
 */
const Module = require("module");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
    if (request.includes("yellowstone-grpc-napi")) {
        return __filename; // resolve to this stub file
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Export empty stubs for the native bindings
module.exports = {};
module.exports.DuplexStream = class DuplexStream {};
module.exports.GrpcClient = class GrpcClient {};
module.exports.decodeTxError = () => null;
