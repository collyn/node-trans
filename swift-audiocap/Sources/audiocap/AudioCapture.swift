import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

@available(macOS 13.0, *)
final class AudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private let sampleRate: Int
    private let channels: Int
    private let stdout = FileHandle.standardOutput
    private let stderr = FileHandle.standardError

    // Resampling state
    private var converter: AVAudioConverter?
    private var inputFormat: AVAudioFormat?
    private var outputFormat: AVAudioFormat?

    init(sampleRate: Int, channels: Int) {
        self.sampleRate = sampleRate
        self.channels = channels
        super.init()
    }

    func start() {
        SCShareableContent.getExcludingDesktopWindows(false, onScreenWindowsOnly: false) { [weak self] content, error in
            guard let self = self else { return }

            if let error = error {
                let desc = error.localizedDescription
                let nsErr = error as NSError
                let isPermissionDenied = nsErr.code == -3801
                    || desc.contains("declined")
                    || desc.contains("permission")
                    || desc.contains("TCC")
                if isPermissionDenied {
                    self.writeStderr("Error: Screen Recording permission denied. Grant permission in System Settings > Privacy & Security > Screen Recording.\n")
                    exit(2)
                }
                self.writeStderr("Error: Failed to get shareable content: \(desc)\n")
                exit(1)
            }

            guard let content = content, let display = content.displays.first else {
                self.writeStderr("Error: No display found\n")
                exit(1)
            }

            let config = SCStreamConfiguration()
            config.capturesAudio = true
            config.sampleRate = self.sampleRate
            config.channelCount = self.channels
            config.excludesCurrentProcessAudio = true
            // Minimum video config (required by API but we discard video)
            config.width = 2
            config.height = 2
            config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 fps minimum

            let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])

            do {
                let stream = SCStream(filter: filter, configuration: config, delegate: self)
                try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: .global(qos: .userInteractive))
                stream.startCapture { error in
                    if let error = error {
                        let nsErr = error as NSError
                        if nsErr.domain == "com.apple.ScreenCaptureKit" && nsErr.code == -3801 {
                            self.writeStderr("Error: Screen Recording permission denied. Grant permission in System Settings > Privacy & Security > Screen Recording.\n")
                            exit(2)
                        }
                        self.writeStderr("Error: Failed to start capture: \(error.localizedDescription)\n")
                        exit(1)
                    }
                    self.writeStderr("Capture started (sample rate: \(self.sampleRate), channels: \(self.channels))\n")
                }
                self.stream = stream
            } catch {
                self.writeStderr("Error: Failed to create stream: \(error.localizedDescription)\n")
                exit(1)
            }
        }
    }

    func stop() {
        stream?.stopCapture { _ in }
        stream = nil
    }

    // MARK: - SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid else { return }

        guard let formatDesc = sampleBuffer.formatDescription,
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee else {
            return
        }

        // Setup converter on first audio buffer if source sample rate differs
        if converter == nil {
            let srcRate = asbd.mSampleRate
            let srcChannels = asbd.mChannelsPerFrame

            inputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: srcRate,
                channels: AVAudioChannelCount(srcChannels),
                interleaved: false
            )

            outputFormat = AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: Double(sampleRate),
                channels: AVAudioChannelCount(channels),
                interleaved: false
            )

            if let inputFormat = inputFormat, let outputFormat = outputFormat,
               inputFormat.sampleRate != outputFormat.sampleRate || inputFormat.channelCount != outputFormat.channelCount {
                converter = AVAudioConverter(from: inputFormat, to: outputFormat)
                if converter == nil {
                    writeStderr("Warning: Could not create audio converter from \(srcRate)Hz/\(srcChannels)ch to \(sampleRate)Hz/\(channels)ch\n")
                }
            }

            writeStderr("Source audio: \(Int(srcRate))Hz, \(srcChannels)ch → Output: \(sampleRate)Hz, \(channels)ch\n")
        }

        // Extract float samples from CMSampleBuffer
        guard let blockBuffer = sampleBuffer.dataBuffer else { return }
        let length = CMBlockBufferGetDataLength(blockBuffer)
        var data = Data(count: length)
        data.withUnsafeMutableBytes { rawBuf in
            guard let ptr = rawBuf.baseAddress else { return }
            CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: ptr)
        }

        let frameCount = sampleBuffer.numSamples
        guard frameCount > 0 else { return }

        let srcChannelCount = Int(asbd.mChannelsPerFrame)

        // If the data is interleaved float32, deinterleave for AVAudioPCMBuffer
        // ScreenCaptureKit typically delivers non-interleaved float32
        let isInterleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0

        var floatSamples: [[Float]]
        if isInterleaved {
            let totalSamples = length / MemoryLayout<Float>.size
            let allSamples = data.withUnsafeBytes { buf -> [Float] in
                let floatBuf = buf.bindMemory(to: Float.self)
                return Array(floatBuf.prefix(totalSamples))
            }
            // Deinterleave
            floatSamples = (0..<srcChannelCount).map { ch in
                stride(from: ch, to: totalSamples, by: srcChannelCount).map { allSamples[$0] }
            }
        } else {
            let samplesPerChannel = frameCount
            floatSamples = []
            let floatSize = MemoryLayout<Float>.size
            for ch in 0..<srcChannelCount {
                let offset = ch * samplesPerChannel * floatSize
                let channelData = data.withUnsafeBytes { buf -> [Float] in
                    let start = buf.baseAddress!.advanced(by: offset)
                    let floatBuf = start.assumingMemoryBound(to: Float.self)
                    return Array(UnsafeBufferPointer(start: floatBuf, count: samplesPerChannel))
                }
                floatSamples.append(channelData)
            }
        }

        var outputFloats: [Float]

        if let converter = converter,
           let inputFormat = inputFormat,
           let outputFormat = outputFormat {
            // Create input PCM buffer
            guard let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: AVAudioFrameCount(frameCount)) else { return }
            inputBuffer.frameLength = AVAudioFrameCount(frameCount)
            for ch in 0..<min(srcChannelCount, Int(inputFormat.channelCount)) {
                let dst = inputBuffer.floatChannelData![ch]
                for i in 0..<frameCount {
                    dst[i] = floatSamples[ch][i]
                }
            }

            // Calculate output frame count based on ratio
            let ratio = outputFormat.sampleRate / inputFormat.sampleRate
            let outputFrameCount = AVAudioFrameCount(ceil(Double(frameCount) * ratio))
            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: outputFrameCount) else { return }

            var error: NSError?
            var inputConsumed = false
            converter.convert(to: outputBuffer, error: &error) { _, outStatus in
                if inputConsumed {
                    outStatus.pointee = .noDataNow
                    return nil
                }
                inputConsumed = true
                outStatus.pointee = .haveData
                return inputBuffer
            }

            if let error = error {
                writeStderr("Warning: Audio conversion error: \(error.localizedDescription)\n")
                return
            }

            let outCount = Int(outputBuffer.frameLength)
            let outChannels = Int(outputFormat.channelCount)

            // Mix down to target channel count (mono)
            if outChannels == 1 {
                outputFloats = Array(UnsafeBufferPointer(start: outputBuffer.floatChannelData![0], count: outCount))
            } else {
                outputFloats = [Float](repeating: 0, count: outCount)
                for ch in 0..<outChannels {
                    let chData = outputBuffer.floatChannelData![ch]
                    for i in 0..<outCount {
                        outputFloats[i] += chData[i]
                    }
                }
                let scale = 1.0 / Float(outChannels)
                for i in 0..<outCount {
                    outputFloats[i] *= scale
                }
            }
        } else {
            // No conversion needed — just mix channels to mono if needed
            let numSamples = floatSamples[0].count
            if channels == 1 && srcChannelCount > 1 {
                outputFloats = [Float](repeating: 0, count: numSamples)
                for ch in 0..<srcChannelCount {
                    for i in 0..<numSamples {
                        outputFloats[i] += floatSamples[ch][i]
                    }
                }
                let scale = 1.0 / Float(srcChannelCount)
                for i in 0..<numSamples {
                    outputFloats[i] *= scale
                }
            } else {
                outputFloats = floatSamples[0]
            }
        }

        // Convert Float32 → Int16 PCM (s16le)
        var pcmData = Data(capacity: outputFloats.count * 2)
        for sample in outputFloats {
            let clamped = max(-1.0, min(1.0, sample))
            let int16Val = Int16(clamped * 32767.0)
            var le = int16Val.littleEndian
            pcmData.append(Data(bytes: &le, count: 2))
        }

        stdout.write(pcmData)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        writeStderr("Stream stopped with error: \(error.localizedDescription)\n")
        exit(1)
    }

    private func writeStderr(_ message: String) {
        if let data = message.data(using: .utf8) {
            stderr.write(data)
        }
    }
}
