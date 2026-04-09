using System.Buffers.Binary;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace AudioCap;

class Program
{
    static int Main(string[] args)
    {
        int sampleRate = 16000;
        int channels = 1;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--sample-rate" when i + 1 < args.Length:
                    sampleRate = int.Parse(args[++i]);
                    break;
                case "--channels" when i + 1 < args.Length:
                    channels = int.Parse(args[++i]);
                    break;
                case "--version":
                    Console.WriteLine("audiocap 1.0.0");
                    return 0;
                case "--help" or "-h":
                    Console.Error.WriteLine("""
                        Usage: audiocap.exe [options]

                        Capture system audio via WASAPI loopback and output raw PCM to stdout.

                        Options:
                          --sample-rate <rate>  Output sample rate in Hz (default: 16000)
                          --channels <count>    Output channel count (default: 1)
                          --version             Print version and exit
                          --help, -h            Show this help

                        Output format: PCM signed 16-bit little-endian (s16le)
                        Requires: Windows Vista or later

                        Exit codes:
                          0  Normal exit
                          1  General error
                        """);
                    return 0;
                default:
                    Console.Error.WriteLine($"Unknown argument: {args[i]}");
                    return 1;
            }
        }

        var stopped = false;
        var stdout = Console.OpenStandardOutput();

        WasapiLoopbackCapture? capture = null;

        try
        {
            capture = new WasapiLoopbackCapture();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error: Failed to initialize WASAPI loopback: {ex.Message}");
            return 1;
        }

        var sourceFormat = capture.WaveFormat;
        Console.Error.WriteLine($"Source audio: {sourceFormat.SampleRate}Hz, {sourceFormat.Channels}ch → Output: {sampleRate}Hz, {channels}ch");

        // Build resampling/channel conversion pipeline
        var sourceWaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(sourceFormat.SampleRate, sourceFormat.Channels);
        var bufferedProvider = new BufferedWaveProvider(sourceWaveFormat)
        {
            ReadFully = false,
            BufferLength = sourceFormat.SampleRate * sourceFormat.Channels * 4 * 2 // 2 seconds buffer
        };

        ISampleProvider pipeline = bufferedProvider.ToSampleProvider();

        // Resample if needed
        if (sourceFormat.SampleRate != sampleRate)
        {
            pipeline = new WdlResamplingSampleProvider(pipeline, sampleRate);
        }

        // Mix to mono if needed
        if (sourceFormat.Channels > 1 && channels == 1)
        {
            pipeline = pipeline.ToMono();
        }

        // Buffer for reading from pipeline
        var readBuffer = new float[sampleRate * channels]; // 1 second
        var pcmBuffer = new byte[readBuffer.Length * 2]; // Int16 = 2 bytes per sample

        capture.DataAvailable += (sender, e) =>
        {
            if (stopped || e.BytesRecorded == 0) return;

            // Feed raw data into buffered provider
            bufferedProvider.AddSamples(e.Buffer, 0, e.BytesRecorded);

            // Read resampled/mixed samples and convert to PCM s16le
            int samplesRead;
            while ((samplesRead = pipeline.Read(readBuffer, 0, readBuffer.Length)) > 0)
            {
                for (int i = 0; i < samplesRead; i++)
                {
                    float clamped = Math.Clamp(readBuffer[i], -1.0f, 1.0f);
                    short int16Val = (short)(clamped * 32767f);
                    BinaryPrimitives.WriteInt16LittleEndian(pcmBuffer.AsSpan(i * 2), int16Val);
                }

                try
                {
                    stdout.Write(pcmBuffer, 0, samplesRead * 2);
                }
                catch
                {
                    // stdout closed (parent process killed pipe)
                    stopped = true;
                }
            }
        };

        capture.RecordingStopped += (sender, e) =>
        {
            if (e.Exception != null)
            {
                Console.Error.WriteLine($"Error: Recording stopped: {e.Exception.Message}");
            }
            stopped = true;
        };

        capture.StartRecording();
        Console.Error.WriteLine($"Capture started (sample rate: {sampleRate}, channels: {channels})");

        // Graceful shutdown: listen for 'q' on stdin or Ctrl+C
        Console.CancelKeyPress += (sender, e) =>
        {
            e.Cancel = true;
            stopped = true;
        };

        // Read stdin for 'q' (Windows process stop convention)
        var stdinTask = Task.Run(() =>
        {
            try
            {
                while (!stopped)
                {
                    var ch = Console.In.Read();
                    if (ch == 'q' || ch == -1)
                    {
                        stopped = true;
                        break;
                    }
                }
            }
            catch
            {
                // stdin closed
                stopped = true;
            }
        });

        // Main loop: wait until stopped
        while (!stopped)
        {
            Thread.Sleep(100);
        }

        capture.StopRecording();
        capture.Dispose();
        stdout.Flush();

        return 0;
    }
}
