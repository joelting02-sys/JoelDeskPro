using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

public static class TdmHostProgram {
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const int GWLP_HWNDPARENT = -8;

    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_APPWINDOW = 0x00040000L;

    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_SHOWWINDOW = 0x0040;

    private const int SW_HIDE = 0;
    private const int SW_SHOW = 5;
    private const int SW_SHOWNA = 8;
    private const int SW_RESTORE = 9;

    private const uint WM_CLOSE = 0x0010;

    private const int DWMWA_EXTENDED_FRAME_BOUNDS = 9;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWA_BORDER_COLOR = 34;
    private const int DWMWCP_DEFAULT = 0;
    private const int DWMWCP_DONOTROUND = 1;
    private const uint DWMWA_COLOR_DEFAULT = 0xFFFFFFFF;
    private const uint DWMWA_COLOR_NONE = 0xFFFFFFFE;

    private const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr")]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    private static extern int GetWindowLong32(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr")]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern int SetWindowLong32(IntPtr hWnd, int nIndex, int dwNewLong);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out RECT pvAttribute, int cbAttribute);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int dwAttribute, ref uint pvAttribute, int cbAttribute);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool QueryFullProcessImageName(IntPtr hProcess, int dwFlags, StringBuilder lpExeName, ref int lpdwSize);

    private static IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex) {
        if (IntPtr.Size == 8) return GetWindowLongPtr64(hWnd, nIndex);
        return new IntPtr(GetWindowLong32(hWnd, nIndex));
    }

    private static IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong) {
        if (IntPtr.Size == 8) return SetWindowLongPtr64(hWnd, nIndex, dwNewLong);
        return new IntPtr(SetWindowLong32(hWnd, nIndex, dwNewLong.ToInt32()));
    }

    private static readonly object _ioLock = new object();
    private static readonly object _stateLock = new object();
    private static readonly JavaScriptSerializer _json = new JavaScriptSerializer();

    private static volatile bool _running = true;
    private static IntPtr _hostHwnd = IntPtr.Zero;
    private static IntPtr _tdmHwnd = IntPtr.Zero;
    private static int _tdmPid = 0;
    private static string _exePath = "";
    private static bool _attached = false;
    private static bool _desiredVisible = false;
    private static bool _closeOnExit = true;
    private static bool _hasSavedExStyle = false;
    private static IntPtr _savedHwndForExStyle = IntPtr.Zero;
    private static long _origExStyle = 0;

    private static int _targetX = 0;
    private static int _targetY = 0;
    private static int _targetW = 800;
    private static int _targetH = 600;

    private static int _padL = 8;
    private static int _padT = 0;
    private static int _padR = 8;
    private static int _padB = 8;

    private static readonly Stopwatch _sw = Stopwatch.StartNew();
    private static long _lastActionMs = 0;
    private static long _lastActivatedMs = 0;

    public static void Run() {
        try {
            try { SetProcessDpiAwarenessContext((IntPtr)(-4)); }
            catch {
                try { SetProcessDpiAwareness(2); } catch {}
            }

            Console.InputEncoding = new UTF8Encoding(false);
            Console.OutputEncoding = new UTF8Encoding(false);

            Thread watcher = new Thread(WatcherLoop);
            watcher.IsBackground = true;
            watcher.Start();

            var ready = new Dictionary<string, object>();
            ready["event"] = "ready";
            WriteLineJson(ready);

            while (_running) {
                string line = Console.ReadLine();
                if (line == null) {
                    PerformShutdown(_closeOnExit);
                    break;
                }
                if (string.IsNullOrWhiteSpace(line)) continue;
                try {
                    var req = _json.DeserializeObject(line) as Dictionary<string, object>;
                    if (req != null) {
                        HandleCommand(req);
                    }
                } catch (Exception ex) {
                    var err = new Dictionary<string, object>();
                    err["event"] = "error";
                    err["error"] = ex.Message;
                    WriteLineJson(err);
                }
            }
        } catch (Exception ex) {
            var fatal = new Dictionary<string, object>();
            fatal["event"] = "fatal";
            fatal["error"] = ex.Message;
            WriteLineJson(fatal);
        }
    }

    private static void WriteLineJson(Dictionary<string, object> obj) {
        string text = _json.Serialize(obj);
        lock (_ioLock) {
            Console.Out.WriteLine(text);
            Console.Out.Flush();
        }
    }

    private static void SendReply(object id, bool ok, Dictionary<string, object> extra) {
        var res = extra != null ? new Dictionary<string, object>(extra) : new Dictionary<string, object>();
        if (id != null) res["id"] = id;
        res["ok"] = ok;
        WriteLineJson(res);
    }

    private static string GetStr(Dictionary<string, object> d, string key, string defVal) {
        object v;
        if (!d.TryGetValue(key, out v) || v == null) return defVal;
        return Convert.ToString(v);
    }

    private static int GetInt(Dictionary<string, object> d, string key, int defVal) {
        object v;
        if (!d.TryGetValue(key, out v) || v == null) return defVal;
        try { return Convert.ToInt32(v); } catch { return defVal; }
    }

    private static long GetLong(Dictionary<string, object> d, string key, long defVal) {
        object v;
        if (!d.TryGetValue(key, out v) || v == null) return defVal;
        try { return Convert.ToInt64(v); } catch { return defVal; }
    }

    private static bool GetBool(Dictionary<string, object> d, string key, bool defVal) {
        object v;
        if (!d.TryGetValue(key, out v) || v == null) return defVal;
        try { return Convert.ToBoolean(v); } catch { return defVal; }
    }

    private static IntPtr ParseHwnd(Dictionary<string, object> d, string key) {
        string s = GetStr(d, key, "");
        if (string.IsNullOrWhiteSpace(s)) return IntPtr.Zero;
        long val;
        if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) {
            if (long.TryParse(s.Substring(2), System.Globalization.NumberStyles.HexNumber, null, out val)) {
                return new IntPtr(val);
            }
        }
        if (long.TryParse(s, out val)) return new IntPtr(val);
        return IntPtr.Zero;
    }

    private static long NowMs() {
        return _sw.ElapsedMilliseconds;
    }

    private static string GetProcessImagePathSafe(int pid) {
        IntPtr hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (hProc == IntPtr.Zero) return null;
        try {
            StringBuilder sb = new StringBuilder(1024);
            int sz = sb.Capacity;
            if (QueryFullProcessImageName(hProc, 0, sb, ref sz)) {
                return sb.ToString();
            }
        } catch {}
        finally { CloseHandle(hProc); }
        return null;
    }

    private static HashSet<int> FindMatchingPids(string exePath) {
        var pids = new HashSet<int>();
        string normExe = "";
        string procName = "";
        if (!string.IsNullOrWhiteSpace(exePath)) {
            try { normExe = Path.GetFullPath(exePath); } catch { normExe = exePath; }
            procName = Path.GetFileNameWithoutExtension(normExe);
        }

        if (string.IsNullOrWhiteSpace(procName)) return pids;
        Process[] byName = Process.GetProcessesByName(procName);
        foreach (Process p in byName) {
            try {
                string img = GetProcessImagePathSafe(p.Id);
                if (string.IsNullOrEmpty(img) || string.IsNullOrEmpty(normExe) ||
                    string.Equals(Path.GetFullPath(img), normExe, StringComparison.OrdinalIgnoreCase)) {
                    pids.Add(p.Id);
                }
            } catch {
                pids.Add(p.Id);
            }
        }
        return pids;
    }

    private static IntPtr FindMainHwndForPids(HashSet<int> pids) {
        if (pids == null || pids.Count == 0) return IntPtr.Zero;
        IntPtr tauriMatch = IntPtr.Zero;
        IntPtr fallbackMatch = IntPtr.Zero;

        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            uint pid;
            GetWindowThreadProcessId(hWnd, out pid);
            if (!pids.Contains((int)pid)) return true;

            StringBuilder clsSb = new StringBuilder(256);
            GetClassName(hWnd, clsSb, 256);
            string cls = clsSb.ToString();

            if (string.Equals(cls, "Tauri Window", StringComparison.Ordinal)) {
                tauriMatch = hWnd;
                return false;
            }

            if (string.Equals(cls, "IME", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cls, "MSCTFIME UI", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cls, "tooltips_class32", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(cls, "Tao Thread Event Target", StringComparison.OrdinalIgnoreCase) ||
                cls.EndsWith("-sic", StringComparison.OrdinalIgnoreCase)) {
                return true;
            }

            StringBuilder txtSb = new StringBuilder(256);
            GetWindowText(hWnd, txtSb, 256);
            string txt = txtSb.ToString();
            if (txt.EndsWith("-siw", StringComparison.OrdinalIgnoreCase)) return true;

            RECT r;
            if (GetWindowRect(hWnd, out r)) {
                int w = r.Right - r.Left;
                int h = r.Bottom - r.Top;
                if ((w >= 200 && h >= 200) || txt.Length > 0) {
                    if (fallbackMatch == IntPtr.Zero) fallbackMatch = hWnd;
                }
            }
            return true;
        }, IntPtr.Zero);

        return tauriMatch != IntPtr.Zero ? tauriMatch : fallbackMatch;
    }

    private static void MeasureDwmPads(IntPtr hwnd) {
        RECT r;
        RECT ext;
        if (GetWindowRect(hwnd, out r) &&
            DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out ext, Marshal.SizeOf(typeof(RECT))) == 0) {
            int pl = Math.Max(0, ext.Left - r.Left);
            int pt = Math.Max(0, ext.Top - r.Top);
            int pr = Math.Max(0, r.Right - ext.Right);
            int pb = Math.Max(0, r.Bottom - ext.Bottom);
            if (pl <= 32 && pt <= 32 && pr <= 32 && pb <= 32) {
                _padL = pl;
                _padT = pt;
                _padR = pr;
                _padB = pb;
            }
        }
    }

    private static void ApplyBoundsInternal(bool ensureShow) {
        if (_tdmHwnd == IntPtr.Zero || !IsWindow(_tdmHwnd)) return;
        int x = _targetX - _padL;
        int y = _targetY - _padT;
        int w = Math.Max(120, _targetW) + _padL + _padR;
        int h = Math.Max(120, _targetH) + _padT + _padB;
        uint flags = SWP_NOZORDER | SWP_NOACTIVATE;
        if (ensureShow && !IsWindowVisible(_tdmHwnd)) {
            flags |= SWP_SHOWWINDOW;
        }
        SetWindowPos(_tdmHwnd, IntPtr.Zero, x, y, w, h, flags);
    }

    private static void ApplyDockStyle(IntPtr tdmHwnd, IntPtr hostHwnd, bool visible) {
        if (!_hasSavedExStyle || _savedHwndForExStyle != tdmHwnd) {
            _origExStyle = GetWindowLongPtr(tdmHwnd, GWL_EXSTYLE).ToInt64();
            _hasSavedExStyle = true;
            _savedHwndForExStyle = tdmHwnd;
        }

        bool wasVisible = IsWindowVisible(tdmHwnd);
        if (wasVisible) {
            ShowWindow(tdmHwnd, SW_HIDE);
        }

        if (hostHwnd != IntPtr.Zero && IsWindow(hostHwnd)) {
            SetWindowLongPtr(tdmHwnd, GWLP_HWNDPARENT, hostHwnd);
        }

        long newEx = (_origExStyle & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
        SetWindowLongPtr(tdmHwnd, GWL_EXSTYLE, new IntPtr(newEx));

        uint dontRound = DWMWCP_DONOTROUND;
        try { DwmSetWindowAttribute(tdmHwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref dontRound, 4); } catch {}
        uint colorNone = DWMWA_COLOR_NONE;
        try { DwmSetWindowAttribute(tdmHwnd, DWMWA_BORDER_COLOR, ref colorNone, 4); } catch {}

        if (IsIconic(tdmHwnd)) {
            ShowWindow(tdmHwnd, SW_RESTORE);
        }

        _padL = 8;
        _padT = 0;
        _padR = 8;
        _padB = 8;

        int x = _targetX - _padL;
        int y = _targetY - _padT;
        int w = Math.Max(120, _targetW) + _padL + _padR;
        int h = Math.Max(120, _targetH) + _padT + _padB;

        if (visible) {
            SetWindowPos(tdmHwnd, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
            MeasureDwmPads(tdmHwnd);
            ApplyBoundsInternal(true);
        } else {
            SetWindowPos(tdmHwnd, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
            ShowWindow(tdmHwnd, SW_HIDE);
        }
    }

    private static void DetachInternal() {
        if (_tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) {
            bool vis = IsWindowVisible(_tdmHwnd);
            if (vis) ShowWindow(_tdmHwnd, SW_HIDE);

            SetWindowLongPtr(_tdmHwnd, GWLP_HWNDPARENT, IntPtr.Zero);
            if (_hasSavedExStyle && _savedHwndForExStyle == _tdmHwnd) {
                SetWindowLongPtr(_tdmHwnd, GWL_EXSTYLE, new IntPtr(_origExStyle));
            }
            uint defCorner = DWMWCP_DEFAULT;
            try { DwmSetWindowAttribute(_tdmHwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref defCorner, 4); } catch {}
            uint defColor = DWMWA_COLOR_DEFAULT;
            try { DwmSetWindowAttribute(_tdmHwnd, DWMWA_BORDER_COLOR, ref defColor, 4); } catch {}

            SetWindowPos(_tdmHwnd, IntPtr.Zero, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
            ShowWindow(_tdmHwnd, SW_SHOW);
        }
        _attached = false;
        _desiredVisible = false;
    }

    private static void PerformShutdown(bool closeTdm) {
        IntPtr hwnd;
        int pid;
        string exe;
        lock (_stateLock) {
            hwnd = _tdmHwnd;
            pid = _tdmPid;
            exe = _exePath;
            _running = false;
            if (!closeTdm) {
                DetachInternal();
                return;
            }
            _attached = false;
            _desiredVisible = false;
        }

        if (closeTdm) {
            HashSet<int> pids = new HashSet<int>();
            if (pid > 0) pids.Add(pid);
            foreach (int foundPid in FindMatchingPids(exe)) {
                pids.Add(foundPid);
            }

            if (hwnd != IntPtr.Zero && IsWindow(hwnd)) {
                PostMessage(hwnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                Thread.Sleep(450);
            }

            foreach (int pId in pids) {
                try {
                    Process pr = Process.GetProcessById(pId);
                    if (!pr.HasExited) {
                        pr.Kill();
                        pr.WaitForExit(1500);
                    }
                } catch {}
            }
        }
    }

    private static void HandleCommand(Dictionary<string, object> req) {
        object id = null;
        req.TryGetValue("id", out id);
        string cmd = GetStr(req, "cmd", "");

        if (cmd == "ping") {
            var d = new Dictionary<string, object>();
            d["ready"] = true;
            SendReply(id, true, d);
            return;
        }

        if (cmd == "config") {
            lock (_stateLock) {
                _closeOnExit = GetBool(req, "closeOnExit", _closeOnExit);
            }
            SendReply(id, true, null);
            return;
        }

        if (cmd == "status") {
            string exe = GetStr(req, "exePath", _exePath);
            if (!string.IsNullOrWhiteSpace(exe)) _exePath = exe;
            HashSet<int> pids = FindMatchingPids(_exePath);
            IntPtr hwnd = (_tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) ? _tdmHwnd : FindMainHwndForPids(pids);
            bool running = pids.Count > 0 || (hwnd != IntPtr.Zero && IsWindow(hwnd));
            bool visible = hwnd != IntPtr.Zero && IsWindow(hwnd) && IsWindowVisible(hwnd);

            var d = new Dictionary<string, object>();
            d["running"] = running;
            d["pid"] = running ? (_tdmPid > 0 && pids.Contains(_tdmPid) ? _tdmPid : FirstPid(pids)) : 0;
            d["hwnd"] = hwnd != IntPtr.Zero ? ("0x" + hwnd.ToInt64().ToString("X")) : "";
            d["visible"] = visible;
            d["attached"] = _attached;
            d["exeExists"] = !string.IsNullOrWhiteSpace(_exePath) && File.Exists(_exePath);

            if (hwnd != IntPtr.Zero && IsWindow(hwnd)) {
                RECT ext;
                if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out ext, Marshal.SizeOf(typeof(RECT))) == 0) {
                    var rectObj = new Dictionary<string, object>();
                    rectObj["left"] = ext.Left;
                    rectObj["top"] = ext.Top;
                    rectObj["right"] = ext.Right;
                    rectObj["bottom"] = ext.Bottom;
                    rectObj["width"] = ext.Right - ext.Left;
                    rectObj["height"] = ext.Bottom - ext.Top;
                    d["extRect"] = rectObj;
                }
            }
            SendReply(id, true, d);
            return;
        }

        if (cmd == "attach") {
            IntPtr hostHwnd = ParseHwnd(req, "hostHwnd");
            string exe = GetStr(req, "exePath", _exePath);
            bool autoLaunch = GetBool(req, "autoLaunch", true);
            bool visible = GetBool(req, "visible", true);
            int x = GetInt(req, "x", 240);
            int y = GetInt(req, "y", 60);
            int w = GetInt(req, "w", 900);
            int h = GetInt(req, "h", 640);
            bool closeOnExit = GetBool(req, "closeOnExit", _closeOnExit);

            if (!string.IsNullOrWhiteSpace(exe)) _exePath = exe;

            HashSet<int> pids = FindMatchingPids(_exePath);
            IntPtr tdmHwnd = FindMainHwndForPids(pids);
            bool justLaunched = false;

            if (tdmHwnd == IntPtr.Zero) {
                if (!autoLaunch) {
                    var dNot = new Dictionary<string, object>();
                    dNot["running"] = false;
                    dNot["attached"] = false;
                    dNot["error"] = "TDM process not running";
                    SendReply(id, false, dNot);
                    return;
                }
                if (string.IsNullOrWhiteSpace(_exePath) || !File.Exists(_exePath)) {
                    var dNoExe = new Dictionary<string, object>();
                    dNoExe["running"] = false;
                    dNoExe["attached"] = false;
                    dNoExe["error"] = "TDM executable not found";
                    SendReply(id, false, dNoExe);
                    return;
                }

                var psi = new ProcessStartInfo(_exePath);
                psi.WorkingDirectory = Path.GetDirectoryName(_exePath);
                psi.UseShellExecute = false;
                Process launched = Process.Start(psi);
                justLaunched = true;

                long deadline = NowMs() + 12000;
                while (NowMs() < deadline) {
                    pids = FindMatchingPids(_exePath);
                    if (launched != null && !launched.HasExited) pids.Add(launched.Id);
                    tdmHwnd = FindMainHwndForPids(pids);
                    if (tdmHwnd != IntPtr.Zero && IsWindowVisible(tdmHwnd)) {
                        Thread.Sleep(250);
                        break;
                    }
                    Thread.Sleep(120);
                }
            }

            if (tdmHwnd == IntPtr.Zero || !IsWindow(tdmHwnd)) {
                var dFail = new Dictionary<string, object>();
                dFail["running"] = pids.Count > 0;
                dFail["attached"] = false;
                dFail["error"] = "Timed out waiting for TDM main window";
                SendReply(id, false, dFail);
                return;
            }

            uint foundPid;
            GetWindowThreadProcessId(tdmHwnd, out foundPid);

            lock (_stateLock) {
                _lastActionMs = NowMs();
                _hostHwnd = hostHwnd;
                _tdmHwnd = tdmHwnd;
                _tdmPid = (int)foundPid;
                _closeOnExit = closeOnExit;
                _targetX = x;
                _targetY = y;
                _targetW = w;
                _targetH = h;
                _desiredVisible = visible;
                _attached = true;

                ApplyDockStyle(tdmHwnd, hostHwnd, visible);
                _lastActionMs = NowMs();
            }

            if (justLaunched && visible) {
                ThreadPool.QueueUserWorkItem(delegate(object _) {
                    Thread.Sleep(480);
                    lock (_stateLock) {
                        if (_attached && _desiredVisible && _tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) {
                            _lastActionMs = NowMs();
                            MeasureDwmPads(_tdmHwnd);
                            ApplyBoundsInternal(true);
                        }
                    }
                });
            }

            var dOk = new Dictionary<string, object>();
            dOk["running"] = true;
            dOk["attached"] = true;
            dOk["pid"] = (int)foundPid;
            dOk["hwnd"] = "0x" + tdmHwnd.ToInt64().ToString("X");
            dOk["visible"] = IsWindowVisible(tdmHwnd);
            SendReply(id, true, dOk);
            return;
        }

        if (cmd == "bounds") {
            int x = GetInt(req, "x", _targetX);
            int y = GetInt(req, "y", _targetY);
            int w = GetInt(req, "w", _targetW);
            int h = GetInt(req, "h", _targetH);
            bool show = GetBool(req, "show", false);

            lock (_stateLock) {
                _targetX = x;
                _targetY = y;
                _targetW = w;
                _targetH = h;
                if (_attached && _tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) {
                    _lastActionMs = NowMs();
                    if (show) _desiredVisible = true;
                    if (_desiredVisible) {
                        if (IsIconic(_tdmHwnd)) ShowWindow(_tdmHwnd, SW_RESTORE);
                        ApplyBoundsInternal(show);
                    }
                }
            }
            SendReply(id, true, null);
            return;
        }

        if (cmd == "hide") {
            lock (_stateLock) {
                _lastActionMs = NowMs();
                _desiredVisible = false;
                if (_tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) {
                    ShowWindow(_tdmHwnd, SW_HIDE);
                }
            }
            SendReply(id, true, null);
            return;
        }

        if (cmd == "show") {
            int x = GetInt(req, "x", _targetX);
            int y = GetInt(req, "y", _targetY);
            int w = GetInt(req, "w", _targetW);
            int h = GetInt(req, "h", _targetH);
            bool activate = GetBool(req, "activate", false);

            lock (_stateLock) {
                _lastActionMs = NowMs();
                _targetX = x;
                _targetY = y;
                _targetW = w;
                _targetH = h;
                _desiredVisible = true;
                if (_attached && _tdmHwnd != IntPtr.Zero && IsWindow(_tdmHwnd)) {
                    if (IsIconic(_tdmHwnd)) ShowWindow(_tdmHwnd, SW_RESTORE);
                    ApplyBoundsInternal(true);
                    ShowWindow(_tdmHwnd, activate ? SW_SHOW : SW_SHOWNA);
                    MeasureDwmPads(_tdmHwnd);
                    ApplyBoundsInternal(true);
                }
            }
            SendReply(id, true, null);
            return;
        }

        if (cmd == "detach") {
            lock (_stateLock) {
                _lastActionMs = NowMs();
                DetachInternal();
            }
            SendReply(id, true, null);
            return;
        }

        if (cmd == "shutdown") {
            bool closeTdm = GetBool(req, "closeTdm", _closeOnExit);
            PerformShutdown(closeTdm);
            SendReply(id, true, null);
            Environment.Exit(0);
            return;
        }

        var dUnknown = new Dictionary<string, object>();
        dUnknown["error"] = "Unknown command: " + cmd;
        SendReply(id, false, dUnknown);
    }

    private static int FirstPid(HashSet<int> pids) {
        foreach (int p in pids) return p;
        return 0;
    }

    private static void WatcherLoop() {
        while (_running) {
            Thread.Sleep(180);
            string pendingEvent = null;

            lock (_stateLock) {
                if (!_attached || _tdmHwnd == IntPtr.Zero) continue;

                if (!IsWindow(_tdmHwnd)) {
                    _attached = false;
                    _desiredVisible = false;
                    _tdmHwnd = IntPtr.Zero;
                    _tdmPid = 0;
                    pendingEvent = "tdm-exited";
                } else {
                    long now = NowMs();
                    bool vis = IsWindowVisible(_tdmHwnd);
                    if (now - _lastActionMs > 400) {
                        if (!_desiredVisible && vis) {
                            if (now - _lastActivatedMs > 800) {
                                _lastActivatedMs = now;
                                pendingEvent = "tdm-activated";
                            }
                        } else if (_desiredVisible && (!vis || IsIconic(_tdmHwnd))) {
                            _desiredVisible = false;
                            ShowWindow(_tdmHwnd, SW_HIDE);
                            pendingEvent = "tdm-hidden-by-user";
                        } else if (_desiredVisible && vis && (GetAsyncKeyState(0x01) & 0x8000) == 0) {
                            RECT ext;
                            if (DwmGetWindowAttribute(_tdmHwnd, DWMWA_EXTENDED_FRAME_BOUNDS, out ext, Marshal.SizeOf(typeof(RECT))) == 0) {
                                int d = Math.Abs(ext.Left - _targetX)
                                      + Math.Abs(ext.Top - _targetY)
                                      + Math.Abs((ext.Right - ext.Left) - _targetW)
                                      + Math.Abs((ext.Bottom - ext.Top) - _targetH);
                                if (d > 8) {
                                    ApplyBoundsInternal(true);
                                }
                            }
                        }
                    }
                }
            }

            if (pendingEvent != null) {
                var evt = new Dictionary<string, object>();
                evt["event"] = pendingEvent;
                WriteLineJson(evt);
            }
        }
    }
}
