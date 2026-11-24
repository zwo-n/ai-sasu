// macOS Vision 으로 사진 속 주인공(피사체)만 남긴 png 를 만든다. 사진 앱의 "피사체 복사"와 같은 기능 (macOS 14 이상).
// osascript -l JavaScript lift-subject.js <원본> <결과.png>  → "ok" | "none"(피사체 못 찾음) | "error: …"
ObjC.import('Foundation');
ObjC.import('Vision');
ObjC.import('CoreImage');
ObjC.import('CoreGraphics');
function run(argv) {
  const [src, dst] = argv;
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(src), $.NSDictionary.dictionary);
  const req = $.VNGenerateForegroundInstanceMaskRequest.alloc.init;
  const err = Ref();
  if (!handler.performRequestsError($.NSArray.arrayWithObject(req), err)) return 'error: perform';
  const results = req.results;
  if (!results || results.count === 0) return 'none';
  const obs = results.objectAtIndex(0);
  const buf = obs.generateMaskedImageOfInstancesFromRequestHandlerCroppedToInstancesExtentError(obs.allInstances, handler, true, err);
  if (!buf) return 'error: mask';
  const img = $.CIImage.imageWithCVPixelBuffer(buf);
  const ctx = $.CIContext.contextWithOptions($.NSDictionary.dictionary);
  const cs = $.CGColorSpaceCreateWithName($.kCGColorSpaceSRGB);
  const ok = ctx.writePNGRepresentationOfImageToURLFormatColorSpaceOptionsError(img, $.NSURL.fileURLWithPath(dst), $.kCIFormatRGBA8, cs, $.NSDictionary.dictionary, err);
  return ok ? 'ok' : 'error: write';
}
