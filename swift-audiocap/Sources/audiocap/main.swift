import Foundation

// Parse command-line arguments
var sampleRate = 16000
var channels = 1

var args = CommandLine.arguments.dropFirst()
while let arg = args.first {
    args = args.dropFirst()
    switch arg {
    case "--sample-rate":
        if let val = args.first, let rate = Int(val) {
            sampleRate = rate
            args = args.dropFirst()
        }
    case "--channels":
        if let val = args.first, let ch = Int(val) {
            channels = ch
            args = args.dropFirst()
        }
    case "--version":
        print("audiocap 1.0.0")
        exit(0)
    case "--help", "-h":
        print("""
        Usage: audiocap [options]

        Capture system audio via ScreenCaptureKit and output raw PCM to stdout.

        Options:
          --sample-rate <rate>  Output sample rate in Hz (default: 16000)
          --channels <count>    Output channel count (default: 1)
          --version             Print version and exit
          --help, -h            Show this help

        Output format: PCM signed 16-bit little-endian (s16le)
        Requires: macOS 13.0+, Screen Recording permission

        Exit codes:
          0  Normal exit
          1  General error
          2  Screen Recording permission denied
        """)
        exit(0)
    default:
        FileHandle.standardError.write("Unknown argument: \(arg)\n".data(using: .utf8)!)
        exit(1)
    }
}

guard #available(macOS 13.0, *) else {
    FileHandle.standardError.write("Error: audiocap requires macOS 13.0 or later\n".data(using: .utf8)!)
    exit(1)
}

let capture = AudioCapture(sampleRate: sampleRate, channels: channels)

// Handle SIGTERM and SIGINT for graceful shutdown
let stopAndExit: @convention(c) (Int32) -> Void = { _ in
    capture.stop()
    exit(0)
}
signal(SIGTERM, stopAndExit)
signal(SIGINT, stopAndExit)

capture.start()

// Keep the process alive
RunLoop.current.run()
