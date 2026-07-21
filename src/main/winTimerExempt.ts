// Windows 11 degrades timer resolution for processes whose windows are all
// minimized/occluded — setTimeout(20) starts firing at ~32ms+. The Discord
// voice packet loop paces one packet per 20ms on exactly such a timer, so a
// minimized Hearth sprays late packets and listeners hear rapid micro-gaps
// (diagnosed 2026-07-21: renderer feed + player both provably healthy in
// discord-audio.log while the stutter played).
//
// The documented opt-out is SetProcessInformation(ProcessPowerThrottling) with
// PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION cleared in StateMask, which
// tells Windows to always honor this process's timer resolution requests.
// There is no Electron API for it and no native addon in this project, so a
// tiny hidden PowerShell P/Invoke applies it to our own pid (same-user process
// — no admin needed). EXECUTION_SPEED is exempted too (EcoQoS demotion).
import { execFile } from 'child_process'

// NOTE: the C# TypeDefinition must stay a single-quoted one-liner — nested
// here-strings do not survive the -Command argument round-trip.
const PS_SCRIPT = [
  `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class PT { [StructLayout(LayoutKind.Sequential)] public struct PPTS { public uint Version; public uint ControlMask; public uint StateMask; } [DllImport("kernel32.dll", SetLastError=true)] public static extern bool SetProcessInformation(IntPtr h, int cls, ref PPTS info, uint size); [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid); }'`,
  `$h = [PT]::OpenProcess(0x0200, $false, TARGET_PID)`,
  `if ($h -eq [IntPtr]::Zero) { Write-Output 'openprocess failed'; exit 1 }`,
  `$s = New-Object PT+PPTS`,
  `$s.Version = 1`,
  // EXECUTION_SPEED (0x1) | IGNORE_TIMER_RESOLUTION (0x4); StateMask 0 = throttling OFF for both.
  `$s.ControlMask = 5`,
  `$s.StateMask = 0`,
  `$ok = [PT]::SetProcessInformation($h, 4, [ref]$s, 12)`,
  `Write-Output ('SetProcessInformation ' + $ok)`,
  `if (-not $ok) { exit 1 }`
].join('; ')

/**
 * Fire-and-forget: exempt the given pid (default: this process) from Windows
 * background power/timer throttling. Logs the outcome; failure is non-fatal —
 * the app just stays at the OS default like before.
 */
export function exemptFromTimerThrottling(pid: number = process.pid): void {
  if (process.platform !== 'win32') return
  const script = PS_SCRIPT.replace('TARGET_PID', String(pid))
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, timeout: 30_000 },
    (err, stdout) => {
      if (err) console.warn('[win-timer] exemption failed:', err.message)
      else console.log('[win-timer] pid', pid, '->', stdout.trim())
    }
  )
}
