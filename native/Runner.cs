using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// A dedicated hidden console gives the downloader a real Ctrl+C signal on Windows.
// Pipes are captured before AllocConsole so the Electron parent retains log/control IO.
internal static class Runner {
    [DllImport("kernel32.dll")] static extern bool AllocConsole();
    [DllImport("kernel32.dll")] static extern bool FreeConsole();
    [DllImport("kernel32.dll")] static extern bool SetConsoleOutputCP(uint codePage);
    [DllImport("kernel32.dll")] static extern bool SetConsoleCP(uint codePage);
    [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("kernel32.dll")] static extern bool GenerateConsoleCtrlEvent(uint type, uint group);
    delegate bool Handler(uint type);
    [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(Handler handler, bool add);
    static Handler ignoreSignal = delegate(uint type) { return true; };
    static string Quote(string value) {
        var b = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') b.Append('\\', slashes * 2 + 1);
            else b.Append('\\', slashes);
            b.Append(c); slashes = 0;
        }
        b.Append('\\', slashes * 2).Append('"');
        return b.ToString();
    }
    static int Main(string[] args) {
        var input = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
        var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
        var errors = new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)) { AutoFlush = true };
        if (args.Length == 0) return 2;
        try {
            FreeConsole(); AllocConsole(); ShowWindow(GetConsoleWindow(), 0);
            SetConsoleOutputCP(65001); SetConsoleCP(65001);
            SetConsoleCtrlHandler(ignoreSignal, true);
            var list = new StringBuilder();
            for (int i = 1; i < args.Length; i++) list.Append(Quote(args[i])).Append(' ');
            var process = new Process();
            process.StartInfo = new ProcessStartInfo(args[0], list.ToString()) {
                UseShellExecute = false, CreateNoWindow = false,
                RedirectStandardOutput = true, RedirectStandardError = true,
                RedirectStandardInput = true, StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            object gate = new object();
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if(e.Data != null) lock(gate) output.WriteLine(e.Data); };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if(e.Data != null) lock(gate) errors.WriteLine(e.Data); };
            process.Start(); process.StandardInput.Close();
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            var controls = new Thread(delegate() {
                try {
                    string command;
                    while ((command = input.ReadLine()) != null) {
                        if (command == "stop") GenerateConsoleCtrlEvent(0, 0);
                    }
                    // Parent disappearing must not leave an orphan recording process.
                    if (!process.HasExited) {
                        GenerateConsoleCtrlEvent(0, 0);
                        if (!process.WaitForExit(30000)) process.Kill();
                    }
                } catch { }
            });
            controls.IsBackground = true; controls.Start();
            process.WaitForExit(); int result = process.ExitCode;
            FreeConsole(); return result;
        } catch(Exception e) { errors.WriteLine(e.Message); return 1; }
    }
}
