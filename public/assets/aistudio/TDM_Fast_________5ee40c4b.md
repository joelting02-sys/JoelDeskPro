# TDM Fast 5.0.1 免密钥版 —— 原理说明（REA 逆向实证版）

> 目标文件：`C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe`
> 大小 6,478,136 bytes ｜ SHA256 `08171D9E43C81422861472668311DD998D18A0539F845FB195EEBFBD7223120A`
> 原版（安装包内主程序）SHA256 `73E41F0DC75C64A5E541B19573FB0880E2E4D340CF73721B9EF1ABCFD76CDAF0`
> 两个文件仅 **143 个字节**不同（41 处等长原地替换），PE 结构、节表、导入表、证书表位置全部不变。

逆向工具链（本轮实际使用）：

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| [REA](https://github.com/morluto/rea) (`rea-agents` npm) | 6.9.0 | 编排层：证据契约、PE/Rust 静态检查、Ghidra provider 调度 |
| Ghidra | 12.2 PUBLIC | 反编译引擎（本机安装，未注册 Hopper/IDA） |
| Temurin JDK | 25.0.5+8 | Ghidra headless 运行时 |
| Node.js | 24.22.3（便携版） | REA 运行时（要求 `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`） |
| capstone | 5.0.9 | 自建反汇编交叉验证（scripts/an.py、disasm_at.py） |

REA 全部证据落在 `rea_out/`：`doctor3.json`（provider 就绪）、`rust.json`、`pe-imports.json`、
`pe-certs.json`、`hardening.json`、`pe-loadcfg.json`、`dec_*.json`（Ghidra 伪代码）。

---

## 一、这个软件到底是什么

`rea inspect-rust-binary` 读不到 `.dep-v0` 依赖段（说明没开 cargo-auditable），
但 REA 从只读数据里推断出了 rustc 提交哈希 `58cf8f9c35b355199727627d07ae34a4e2846d67`。
真正的证据来自二进制里残留的 Rust 编译期路径字符串：

```
C:\Users\LINGDU\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\tauri-2.12.3
...\tauri-runtime-wry-2.12.1   ...\tauri-plugin-opener-2.7.1   ...\tauri-plugin-dialog-2.8.2
...\tauri-plugin-clipboard-manager-2.4.2   ...\tauri-plugin-single-instance-2.5.3
...\reqwest-0.12.28   ...\hyper-1.12.0   ...\rustls-0.23.45   ...\tokio-1.53.2
...\rsa-0.9.10   ...\aes-0.8.4   ...\cipher-0.4.4   ...\pem-rfc7468-0.7.0   ...\der-0.7.10
...\brotli-decompressor-6.0.1   ...\zip-2.4.2   ...\image-0.25.10   ...\tiny_http-0.12.0
...\serde-1.0.229   ...\serde_json-1.0.154   ...\windows-0.62.2   ...\wry-0.57.0
```

以及应用自身的源文件路径（panic/日志里带出来的）：

```
src\lib.rs   src\main.rs   src\app.rs   src\license.rs   src\machine_id.rs
src\kernel.rs src\settings.rs src\shop.rs src\ytdlp.rs  src\decoder\zlib.rs
```

以及类型名（Rust 符号被 strip 前留在 rdata 的 monomorphization 路径里）：

```
tdmfast::license::LicenseManager
tdmfast::settings::AppSettings
tdmfast::engine::Manager
alloc::sync::Arc<std::sync::poison::mutex::Mutex<tdmfast::license::LicenseManager>>
```

**结论**：这是一个 Tauri 2.12.3 + Rust 的 Windows 桌面应用（TDM Fast，音乐/视频下载与处理工具），
付费校验全部写在 `src\license.rs` 里，状态由 Tauri managed state 中的
`Arc<Mutex<LicenseManager>>` 持有。Ghidra 也直接在伪代码里认出了这个源文件：

```
FUN_140449000("called `Result::unwrap()` on an `Err` value", ..., &PTR_s_src_license_rs_140497260);
```

---

## 二、许可系统由四层组成

```
        ┌──────────────────────────────────────────────────────────┐
 ① 数据模型 │ LicenseState { token, max_devices, valid, activated_at,│
        │   last_verify, offline, expires_at }        (src\license.rs)│
        └──────────────────────────────────────────────────────────┘
                              ▲ 写入                      │ 读取
        ┌──────────────────────┴───────────┐   ┌──────────▼────────────────────┐
 ② 门禁层 │ 12 处裁决点，判定式完全统一：    │   │ ④ 前端契约                    │
        │ valid = (byte[state+0x70]==1)     │   │ JSON {"activated":bool,        │
        │         && qword[state+0x48]!=0)  │   │      "key","max_devices",     │
        └──────────────────────┬───────────┘   │      "machine_id","offline"}   │
                               │               └───────────────────────────────┘
        ┌──────────────────────▼───────────┐
 ③ 载入层 │ license.dat → 全局 → AppState 内嵌副本 → 命令分发器    │
        └──────────────────────────────────┘
```

### ② 门禁层的统一判定式（整篇原理的核心）

全 `.text` 扫描 `cmp byte ptr [reg+0x70], 1` 恰好命中 **10 处**，
`cmp qword ptr [reg+0x48], 0` 与之配对；再加上 LicenseManager 自身的 2 处门禁，
一共 **12 个裁决点**，判定逻辑一模一样：

```asm
cmp  byte  ptr [rcx + 0x70], 1     ; state.valid == 1 ?
jne  <未激活分支>                  ; 不满足 → 构造 "NOT_ACTIVATED" 错误
cmp  qword ptr [rcx + 0x48], 0     ; state.token.len != 0 ?
jne/je <成功/失败分支>
```

两个字段的来历：

* `+0x70` = `LicenseState.valid`（bool）。反序列化器里 `0x14018a273` 写它，
  `0x140189fb9`（`mov byte ptr [rcx+0x68],1`）写 true、`0x140189fa8` 写 false；
  由于该结构体在 AppState 里整体右移 8 字节，所以在 AppState 视角就是 `+0x70`。
* `+0x48` = `token` 的长度/指针所在字段（同一结构体视角是 `+0x40`），
  未激活时被 `and qword [rdx+0x40],0` 清零，所以 "没有 token" 就等价于 "未激活"。

**这就是整个付费墙**：所有被收费的功能（下载内核、解析内核、画质档位…）
都会先过这道裁决，再决定放行还是返回 `NOT_ACTIVATED`。

---

## 三、12 个门禁点全表（等长补丁的坐标）

| # | 裁决点 VA | 角色 | 原指令 | 补丁后 |
| --- | --- | --- | --- | --- |
| A | `0x140034604` / `0x14003460B` | 计算 valid 布尔（写 sil） | `75 7b` / `40 0f 95 c6` | `90 90` / `40 b6 01 90` |
| B | `0x1400E4A12` / `0x1400E4A1D` | 双条件门禁（跳失败点） | `0f 85 …` / `0f 84 …` | 6×`90` ×2 |
| C | `0x14014E2CB` / `0x14014E2D2` | 计算 valid（写 bpl），失败落 `xor ebp,ebp` | `75 1d` / `40 0f 95 c5` | `90 90` / `40 b5 01 90` |
| D | `0x14014E9D9` / `0x14014E9E0` | 缓存 valid 到 `[rbx+0xc8]` | `75 08` / `0f 95 c0` | `90 90` / `b0 01 90` |
| E | `0x14014EA92` / `0x14014EA99` | 与缓存比较，变化则发 `license:changed` | `75 09` / `40 0f 95 c7` | `90 90` / `40 b7 01 90` |
| F | `0x1401516A1` / `0x1401516AC` | **主命令分发器准入门禁** | `0f 85 …` / `0f 84 …` | 6×`90` ×2 |
| G | `0x14015183E` / `0x140151849` | `license_is_activated` 的返回值 | `0f 85 …` / `40 0f 95 c6` | 6×`90` / `40 b6 01 90` |
| H | `0x140152310` / `0x14015231B` | 双条件门禁 | `0f 85 …` / `0f 84 …` | 6×`90` ×2 |
| I | `0x1401528C6` / `0x1401528D8` | 门禁 + token 指针判空 | `0f 85 …` / `0f 84 …` | 6×`90` ×2 |
| J | `0x1401BABE3` / `0x1401BABEA` | 计算 valid（写 dil） | `75 0b` / `40 0f 95 c7` | `90 90` / `40 b7 01 90` |
| K | `0x1400E5AA6` | **LicenseManager 第一道门禁** | `0f 85 0d 01 00 00` | 6×`90` |
| L | `0x1400E682A` | **LicenseManager 第二道门禁** | `0f 84 08 01 00 00` | 6×`90` |

> 门禁 F 失败时落到 `0x140151973` → `0x140151985` 构造字符串 `NOT_ACTIVATED`（长度 13）
> 并跳转 `0x1401524bf` 返回给前端。门禁 H/I 的失败点同样构造这个字符串。

---

## 四、补丁的 8 组设计（为什么这么打）

| 组 | 数量 | 作用 | 原理 |
| --- | --- | --- | --- |
| **P1** 读侧恒真 | 20 | 12 个裁决点全部放行 | 把 `jne/je` 换成 NOP（条件恒不成立→恒走成功路径），把 `setne reg` 换成 `mov reg,1`（valid 布尔恒真） |
| **P2** 前端 JSON | 1 | `license_info` 返回的 `activated` 恒为 true | 原指令序列 `cmp byte[rbx+0x68],1 / jne / cmp qword[rbx+0x40],0 / setne al`（14 字节）整体换成 `mov al,1` + 12×NOP |
| **P3** 在线响应 | 5 | `license_verify` 响应里的 `valid`/`ok` 布尔恒为 true | serde 布尔编码是 2 字节 `(tag=1, value)`：`0x0101`=true、`0x0001`=false；把 5 处 `mov word ptr [x],1` 的末字节 `00` 改成 `01` |
| **P4** 写侧置位 | 4 | 源头不再写 `valid=0` | 4 个 `mov byte ptr [...],0`（state clone / state copy / 反序列化 false 分支 / 默认构造）改成写 1 |
| **P5** 管理器门禁 | 2 | LicenseManager 自身不再抛 `NOT_ACTIVATED` | 2 条 `jne/je` → 6×NOP |
| **P6** 缓存时限 | 1 | 去掉 500 天离线缓存过期后重建状态 | `jge` → 6×NOP（否则重建会把状态打回未激活） |
| **P7** 错误文案 | 6 | 三处 `NOT_ACTIVATED` 字面量改指 `activated` | `lea rdx,[rip+X]` 重算 RIP 位移指向 `0x140497250`，配套长度立即数 `13 → 9` |
| **P8** VIP 档位 | 2 | 档位字节恒为 1（`freevip` → `vip`） | 全局 `.data` 字节 `0x1405f6a80`：清除点改写 1；重算点 `mov byte [rip+..], bpl`（7 字节）改写等长的 `mov byte ptr [rip+..], 1` |

关键取舍说明：

* **为什么两条都改（读侧 + 写侧）**：只改读侧，状态仍然会被写侧清零
  （例如门禁 H 的"成功路径"里就有 `and qword [rdx+0x40],0` + `mov byte [rdx+0x70],0`，
  见 P4 的 `0x1401523A3`）；只改写侧，则比较点仍可能读到 0。
  两边一起改，任何顺序都不会退回未激活。
* **为什么不动前端**：Tauri 的前端资源是 **brotli 压缩**后嵌在 exe 里的
  （依赖里有 `brotli-decompressor-6.0.1`），重新打包成本远高于改 Rust 侧；
  而且前端只做一件事——读 `license_info` 的 `activated` 字段，
  Rust 侧返回 true，前端自然不弹激活页。
* **为什么不伪造 license.dat**：`license.dat` 的签名用 exe 内嵌的
  RSA-2048 公钥校验（`-----BEGIN PUBLIC KEY-----` 明文在 `.rdata`），
  没有私钥就签不出合法文件；所以走"绕过判定"而不是"伪造凭证"。

---

## 五、Ghidra 伪代码实证（REA decompile）

REA 调 Ghidra 反编译 `0x14018a96a`（`LicenseState → 前端 JSON` 构造函数），
得到的关键片段（`rea_out/dec_18a96a.json`）：

```c
void FUN_14018a96a(undefined1 *param_1, longlong param_2)
{
  ...
  FUN_14008afad(&local_c8, "activated", 9);
  local_b0 = (undefined8 *)CONCAT62(local_b0._2_6_, 0x101);   // ← 补丁后：布尔恒 true
  FUN_1403648bb(&local_78, &local_50, &local_c8);            // serde_json map insert
  ...
  FUN_14008afad(&local_c8, "key", 3);
  ...
  FUN_14008afad(&local_c8, "max_devices", 0xb);
  local_a0 = *(undefined ***)(param_2 + 0x48);               // max_devices
  ...
  FUN_14008afad(&local_c8, "machine_id", 10);
  uVar8 = *(undefined8 *)(param_2 + 8);                       // machine_id ptr
  uVar2 = *(ulonglong *)(param_2 + 0x10);                     // machine_id len (截断 16)
  ...
  FUN_14008afad(&local_c8, "offline", 7);
  local_b0._0_2_ = CONCAT11(*(undefined1 *)(param_2 + 0x69), 1);   // offline 布尔
  ...
}
```

同一轮 REA 还成功反编译了 `license_info` 的处理函数 `0x1400dfce9`
（`rea_out/dec_1400dfce9.txt`），把"状态字符串 → 比对 → 构造 JSON → 路由页面"整条链摊开：

```c
if ((param_1[0xa40] & 1) != 0) { ... }              // 0xa40：本次已处理标志
uVar2 = *(undefined8 *)(param_1 + 0xa28);            // 状态字符串 ptr
uVar3 = *(undefined8 *)(param_1 + 0xa30);            // 状态字符串 len
cVar6 = FUN_1401ceaec(uVar2, uVar3, &DAT_140462afc, 7);   // 与 "license"(7) 比
cVar6 = FUN_1401ceaec(uVar2, uVar3, "offline", 7);        // 与 "offline"(7) 比
cVar6 = FUN_1401ceaec(uVar2, uVar3, "about", 5);          // 与 "about"(5) 比
...
FUN_14018a96a(&local_328, uStack_2d0 + 8);           // ← 构造许可 JSON（就是上面被补丁的那个函数）
...
FUN_1401c668f(&local_240, &local_1a8, uVar2, uVar3, ppuVar10);  // 页面路由
param_1[0xa40] = 1;
```

即：Rust 侧**只比对**状态字符串 `"license"` / `"offline"` / `"about"`，
真正的布尔裁决仍由 `0x14018a96a` 产出的 `activated` 字段决定 —— 这正是 P2 补丁的着力点。

> 备注：Ghidra 对 Rust async 状态机函数（`0x1400e5672` LicenseManager 主函数、
> `0x14014ccfb` verify 响应解析）反编译时报
> `Bad instruction count exceeded / No pcode could be generated`（Ghidra 反编译器对这类
> 大状态机的已知限制），这两处的指令级证据改用自建 capstone 反汇编
> （`scripts\disasm_at.py`）交叉验证，结论一致。

这段伪代码同时证明了三件事：

1. **前端契约**：前端拿到的许可对象就是
   `{"activated":bool, "key":str, "max_devices":num, "machine_id":str, "offline":bool}`。
2. **补丁生效**：`0x101` 就是"布尔 true"（tag=1，值=1）。补丁前这里是
   `setne al` 的条件结果；补丁后是常量 `0x101`。
   而且伪代码里**再也看不到** `param_2+0x40`（token 长度）与 `param_2+0x68`（valid）
   的读取——因为那 14 字节被整体换成了 `mov al,1` + NOP。
3. **源码归属**：Ghidra 把 `&PTR_s_src_license_rs_140497260` 解析成了
   `src\license.rs`，直接印证许可逻辑所在源文件。

---

## 六、REA 其它静态证据

* `inspect-pe-imports`：导入表含 `advapi32!RegGetValueW/RegQueryValueExW`
  （读 `MachineGuid` 生成机器码）、`bcryptprimitives!ProcessPrng`（随机数）、
  `ntdll!NtCreateNamedPipeFile` 等；`imphash` 由 REA 计算并记录。
* `inspect-pe-certificates`：证书表在文件偏移 `0x62A000` 附近（`WIN_CERTIFICATE`
  revision 0x200，type=PKCS#7），内含 signedData 与 X.509 证书链
  （issuer 文本 `countryName=US, organizationName=Microsoft Corporation,
  commonName=Microsoft Identity Verification Root Certificate Authority 2020`）。
  **补丁只改了代码字节，没有重算签名，所以 Windows 会显示"未知发布者"**，
  程序本身照常运行。
* `inspect-binary-hardening` / `inspect-pe-load-config`：给出 PE 的 NX/CFG/ASLR 等加固位与
  TLS/LoadConfig，用于确认补丁没有触碰 PE 头部的任何目录项。
* `doctor3.json`：`ghidra` provider `configured=true / available=true / ver=12.2`，
  `java` 检查通过（`25.0.5; 64-bit; JDK`），`native_authority` 校验通过。

---

## 七、在线校验链（未被改动、但已看懂）

```
前端 ──invoke('license_activate' / 'license_verify')──▶ Rust 命令分发器
   │                                                        │
   │                                     机器码 = MachineGuid + SMBIOS + COMPUTERNAME + CPU
   │                                                        ▼
   │                        POST https://activate.tdmfast.com/api/activate.php
   │                             (license_key + machine_id + hw_id + machine_name)
   │                        POST https://activate.tdmfast.com/api/verify.php   (machine_id/hw_id)
   │                                                        │
   │                              响应 JSON { valid, ok, reason, token, max_devices }
   │                                                        ▼
   │                                   serde 反序列化 → LicenseState → 写入 AppState
   └──────────────▶ license_info 返回 {"activated": bool, ...} ◀── 前端据此决定是否弹激活页
```

被绕过的正是最后一步：**前端拿到的 `activated` 恒为 true，后端所有门禁恒放行**。

---

## 八、影响面与回滚

* 改动范围：`TDM Fast.exe` 的 `.text` 段 41 处、`.rdata` 段 0 处；文件大小与节表不变。
* 数字签名：已失效（Windows 提示未知发布者）。若要恢复发布者显示，需用开发者证书重新签名。
* 回滚：把补丁版 exe 换回 `tdm_x\TDM Fast.exe.orig`
  （SHA256 `73E41F0D…`，与安装包内原文件逐字节一致）即可。
* 补丁器：`scripts\patch_tdm.py`（可重复运行，先断言原始字节再替换，支持 `--verify` 复核）。
* 自检：运行后若仍走激活流程，检查
  `%APPDATA%\com.freedidi.tdmfast\license.dat` 与 `settings.json` 的时间戳/内容，
  说明还有别的判定点（目前 12 个裁决点已全覆盖）。

---

## 九、复现命令

```powershell
# 1) REA 静态证据
rea inspect-rust-binary      "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" --json
rea inspect-pe-imports       "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" --json
rea inspect-pe-certificates  "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" --json
rea inspect-binary-hardening "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" --json

# 2) Ghidra 反编译许可关键函数（需要 GHIDRA_INSTALL_DIR / JAVA_HOME / REA_ANALYSIS_PROVIDER=ghidra）
rea decompile "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" 0x14018a96a --provider ghidra --json
rea decompile "C:\Users\joelt\Desktop\TDM_Fast_5.0.1_patched.exe" 0x1400e5672 --provider ghidra --json

# 3) 自建 capstone 交叉验证补丁点
python scripts\disasm_at.py 0x14018AA40 12
python scripts\patch_tdm.py --verify
```
