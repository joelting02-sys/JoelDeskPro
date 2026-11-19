// Local desktop health & GitHub self-updater backend for Joel Desk Pro Desktop (.exe).
// Zero external npm dependencies (uses Node.js 20+ built-in fetch).
const http = require('node:http');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

/**
 * Detects Chrome's currently configured default download directory on the user's machine.
 * Used when saving downloaded GitHub Release installers.
 */
function detectChromeDefaultDownloadDir() {
  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    candidates.push(
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'Preferences'),
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'Preferences')
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Preferences')
    );
  } else {
    candidates.push(
      path.join(os.homedir(), '.config', 'google-chrome', 'Default', 'Preferences'),
      path.join(os.homedir(), '.config', 'chromium', 'Default', 'Preferences')
    );
  }

  for (const prefPath of candidates) {
    try {
      if (!fsSync.existsSync(prefPath)) continue;
      const raw = fsSync.readFileSync(prefPath, 'utf8');
      const prefs = JSON.parse(raw);
      const chromeDir = prefs?.download?.default_directory || prefs?.savefile?.default_directory;
      if (typeof chromeDir === 'string' && chromeDir.trim()) {
        return chromeDir.trim();
      }
    } catch {}
  }

  return path.join(os.homedir(), 'Downloads');
}

function startLocalEngine(options = {}) {
  const PORT = Number(options.port || process.env.JOELDESKPRO_PORT || 17890);
  const TOKEN = options.token || process.env.JOELDESKPRO_TOKEN || 'joeldeskpro-local-bridge';
  const ACCEPTED_TOKENS = new Set(
    [TOKEN, 'joeldeskpro-local-bridge', 'deskkit-local-bridge'].filter(Boolean)
  );
  const IS_PACKAGED = Boolean(options.isPackaged);
  const onLaunchInstaller =
    typeof options.onLaunchInstaller === 'function' ? options.onLaunchInstaller : null;

  function isTokenAuthorized(reqToken) {
    if (!reqToken) return true; // Localhost loopback (127.0.0.1) allows omitted token
    return ACCEPTED_TOKENS.has(String(reqToken).trim());
  }

  function sanitizeName(name) {
    return (name || 'download.bin').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'download.bin';
  }

  async function findGitProjectDir() {
    const candidates = [
      process.cwd(),
      path.resolve(__dirname, '..'),
      path.join(process.cwd(), 'JoelDeskPro'),
      path.join(os.homedir(), 'JoelDeskPro'),
      path.join(os.homedir(), 'Desktop', 'JoelDeskPro'),
    ];
    for (const dir of candidates) {
      if (!dir || dir.includes('.asar')) continue;
      try {
        await fs.access(path.join(dir, '.git'));
        return dir;
      } catch {}
    }
    return null;
  }

  async function downloadAndLaunchLatestReleaseExe(safeRepo) {
    const logs = [];
    const relUrl = `https://api.github.com/repos/${safeRepo}/releases/latest`;
    logs.push('> GET ' + relUrl);
    const relRes = await fetch(relUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'JoelDeskPro-Updater',
      },
    });
    if (!relRes.ok) {
      throw new Error(
        relRes.status === 404
          ? `未在 ${safeRepo} 找到已发布的 Release 安装包，请等待 GitHub Actions 构建完成或手动下载`
          : `查询 GitHub Release 失败（HTTP ${relRes.status}）`
      );
    }
    const rel = await relRes.json();
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
    const exeAssets = assets.filter(
      (a) => a && typeof a.name === 'string' && /\.exe$/i.test(a.name) && a.browser_download_url
    );
    const preferred =
      exeAssets.find((a) => (isPortable ? /portable/i.test(a.name) : /setup/i.test(a.name))) ||
      exeAssets[0];

    if (!preferred) {
      throw new Error(
        `最新 Release (${rel.tag_name || 'latest'}) 中暂未包含 Windows .exe 安装包，请稍后重试或前往 Releases 页面下载`
      );
    }

    const saveDir = detectChromeDefaultDownloadDir();
    await fs.mkdir(saveDir, { recursive: true });
    const fileName = sanitizeName(preferred.name);
    const destPath = path.join(saveDir, fileName);
    logs.push(`> Downloading ${preferred.name} -> ${destPath}`);

    const dlRes = await fetch(preferred.browser_download_url, {
      headers: { 'User-Agent': 'JoelDeskPro-Updater' },
    });
    if (!dlRes.ok || !dlRes.body) {
      throw new Error(`下载最新安装包失败（HTTP ${dlRes.status}）`);
    }

    const fh = await fs.open(destPath, 'w');
    let written = 0;
    try {
      for await (const chunk of dlRes.body) {
        const buf = Buffer.from(chunk);
        await fh.write(buf);
        written += buf.length;
      }
    } finally {
      await fh.close();
    }
    logs.push(`> Downloaded ${(written / (1024 * 1024)).toFixed(1)} MB`);

    if (onLaunchInstaller) {
      await onLaunchInstaller(destPath, isPortable);
      logs.push(isPortable ? '> Revealed portable .exe in folder' : '> Launched installer .exe');
    }

    const tag = rel.tag_name || 'latest';
    return {
      ok: true,
      mode: 'release_exe',
      updatedSha: tag,
      installerPath: destPath,
      message: isPortable
        ? `已下载新版便携包 ${fileName}（${tag}），已为你打开所在文件夹`
        : `已下载最新安装包 ${fileName}（${tag}）并启动安装程序`,
      log: logs.join('\n'),
    };
  }

  async function runLocalGitUpdate(repo, branch) {
    const safeRepo = (repo || 'joelting02-sys/JoelDeskPro').replace(/[^A-Za-z0-9_.\-/]/g, '');
    const safeBranch = (branch || 'main').replace(/[^A-Za-z0-9_.\-/]/g, '');

    if (IS_PACKAGED && process.platform === 'win32') {
      return downloadAndLaunchLatestReleaseExe(safeRepo);
    }

    const projectDir = await findGitProjectDir();
    if (!projectDir) {
      if (process.platform === 'win32') {
        return downloadAndLaunchLatestReleaseExe(safeRepo);
      }
      throw new Error(
        `未在当前目录检测到 .git 仓库（${process.cwd()}）。请使用一键更新脚本或前往 GitHub Releases 下载最新版本。`
      );
    }

    const logs = [];
    logs.push(`> git fetch origin ${safeBranch} (in ${projectDir})`);
    await execFileAsync('git', ['fetch', 'origin', safeBranch], { cwd: projectDir, timeout: 60000 });

    try {
      const pullRes = await execFileAsync('git', ['pull', '--ff-only', 'origin', safeBranch], {
        cwd: projectDir,
        timeout: 60000,
      });
      logs.push((pullRes.stdout || pullRes.stderr || '').trim());
    } catch {
      logs.push('> --ff-only failed, retrying with git pull --rebase --autostash');
      const rebaseRes = await execFileAsync(
        'git',
        ['pull', '--rebase', '--autostash', 'origin', safeBranch],
        { cwd: projectDir, timeout: 60000 }
      );
      logs.push((rebaseRes.stdout || rebaseRes.stderr || '').trim());
    }

    const execNpmOpts = {
      cwd: projectDir,
      timeout: 180000,
      shell: process.platform === 'win32',
    };
    logs.push('> npm install');
    const inst = await execFileAsync('npm', ['install'], execNpmOpts);
    if (inst.stdout) logs.push(inst.stdout.trim().slice(-400));

    logs.push('> npm run build');
    const build = await execFileAsync('npm', ['run', 'build'], execNpmOpts);
    if (build.stdout) logs.push(build.stdout.trim().slice(-400));

    const shaRes = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: projectDir,
      timeout: 15000,
    });
    const updatedSha = (shaRes.stdout || '').trim();
    return {
      ok: true,
      mode: 'git',
      updatedSha,
      message: `已成功从 ${safeRepo} (${safeBranch}) 拉取并构建最新版本 (${updatedSha.slice(0, 7)})`,
      log: logs.filter(Boolean).join('\n'),
    };
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DeskKit-Token');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1:' + PORT);

    if (reqUrl.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: true,
          desktop: true,
          packaged: IS_PACKAGED,
          tdmHosted: true,
          whisperHosted: true,
        })
      );
      return;
    }

    if (req.method === 'POST' && reqUrl.pathname === '/api/update') {
      const reqToken = req.headers['x-deskkit-token'];
      if (!isTokenAuthorized(reqToken)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid token' }));
        return;
      }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        const result = await runLocalGitUpdate(body.repo, body.branch);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: false,
            error: e.message || 'Update failed',
            log: [e.stdout, e.stderr].filter(Boolean).join('\n').trim() || undefined,
          })
        );
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.on('error', () => {
    // Port may already be bound by another local engine instance.
  });

  server.listen(PORT, '127.0.0.1');

  return {
    close() {
      try {
        server.close();
      } catch {}
    },
  };
}

module.exports = { startLocalEngine, detectChromeDefaultDownloadDir };
